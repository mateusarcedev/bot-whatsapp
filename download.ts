import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Path to yt-dlp executable (from env or global path)
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

interface DownloadResult {
  filePath: string;
  title: string;
  mediaType: 'video' | 'image' | 'document' | 'audio';
  size: number;
}

/**
 * Downloads media from a given URL using yt-dlp or fallback scrapers.
 */
export async function downloadMedia(url: string, outputDir: string, formatType: 'video' | 'audio' = 'video'): Promise<DownloadResult> {
  try {
    // Try yt-dlp first for everything
    return await downloadWithYtDlp(url, outputDir, formatType);
  } catch (error: any) {
    console.log(`yt-dlp failed or no file found: ${error.message}`);

    // Fallback: Scraping (OG Image) - ONLY if looking for video/default. 
    // If user specifically asked for audio, scraping an image is not useful.
    if (formatType === 'audio') {
      throw new Error("Audio download failed. Scraping fallback not available for audio.");
    }

    console.log('Attempting generic fallback scraping (og:image)...');
    try {
      return await scrapeOgImage(url, outputDir);
    } catch (scrapeError: any) {
      // If both fail, throw the original yt-dlp error (usually more descriptive) or a combined one
      throw new Error(`Failed to download media. yt-dlp error: ${error.message}. Scraping error: ${scrapeError.message}`);
    }
  }
}

async function downloadWithYtDlp(url: string, outputDir: string, formatType: 'video' | 'audio'): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    // Use a generic template, yt-dlp will fill extension
    let outputTemplate: string;
    let mediaType: 'video' | 'audio';

    let args: string[] = [];

    if (formatType === 'audio') {
      outputTemplate = path.join(outputDir, `${timestamp}_%(title)s.%(ext)s`);
      mediaType = 'audio';
      args = [
        url,
        '-o', outputTemplate,
        '--format', 'bestaudio[ext=m4a]/bestaudio/best', // Relaxed format: prefer m4a, but take anything
        '--no-playlist',
        '--max-filesize', '100M',
        '--force-overwrites',
        // 'android' client is often more permissible than 'ios' without PO Token
        '--extractor-args', 'youtube:player_client=android',
      ];
    } else {
      // Video args
      outputTemplate = path.join(outputDir, `${timestamp}_%(title).50s.%(ext)s`);
      mediaType = 'video';
      args = [
        url,
        '-o', outputTemplate,
        '--format', 'best[ext=mp4]/best', // Relaxed video format
        '--no-playlist',
        '--max-filesize', '500M',
        '--force-overwrites',
        // 'android' client for consistency
        '--extractor-args', 'youtube:player_client=android',
      ];
    }

    console.log(`Starting download (${formatType}): ${YTDLP_PATH} ${args.join(' ')}`);

    const process = spawn(YTDLP_PATH, args);

    let stdoutData = '';
    let stderrData = '';
    let downloadedFilePath: string | null = null;

    process.stdout.on('data', (data) => {
      const line = data.toString();
      stdoutData += line;
      console.log('STDOUT:', line.trim());

      // Capture destination path
      const destMatch = line.match(/Destination:\s+(.+)/);
      if (destMatch) downloadedFilePath = destMatch[1];

      const alreadyMatch = line.match(/Already downloaded:\s+(.+)/);
      if (alreadyMatch) downloadedFilePath = alreadyMatch[1];
    });

    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    process.on('close', (code) => {
      // Fallback file finding
      if (!downloadedFilePath) {
        try {
          const files = fs.readdirSync(outputDir);
          const match = files.find(f => f.startsWith(`${timestamp}_`));
          if (match) {
            downloadedFilePath = path.join(outputDir, match);
          }
        } catch (err) { }
      }

      if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
        const stats = fs.statSync(downloadedFilePath);
        resolve({
          filePath: downloadedFilePath,
          title: path.basename(downloadedFilePath),
          mediaType: mediaType,
          size: stats.size
        });
      } else {
        // Determine error message (filter out warning)
        const cleanStderr = stderrData.replace(/Deprecated Feature:.*?deprecated\n/g, '');
        reject(new Error(`yt-dlp exited with code ${code}. Stderr: ${cleanStderr || 'No video file found.'}`));
      }
    });
  });
}

// Generic Fallback for Images (Pinterest, Instagram, Twitter, etc)
async function scrapeOgImage(url: string, outputDir: string): Promise<DownloadResult> {
  console.log(`Scraping ${url} for og:image...`);
  // 1. Fetch page HTML
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  };

  const response = await axios.get(url, { headers });
  const html = response.data;
  const $ = cheerio.load(html);

  // 2. Find og:image (or twitter:image)
  let ogImage = $('meta[property="og:image"]').attr('content');
  if (!ogImage) {
    ogImage = $('meta[name="twitter:image"]').attr('content');
  }

  if (!ogImage) {
    throw new Error('Could not find og:image or twitter:image on page');
  }

  console.log(`Found image via scraping: ${ogImage}`);

  // 3. Download the image
  const timestamp = Date.now();
  // basic extension guess
  let ext = path.extname(ogImage.split('?')[0]) || '.jpg';
  if (ext.length > 5) ext = '.jpg'; // Safety fix for weird urls

  const filename = `${timestamp}_image${ext}`;
  const filePath = path.join(outputDir, filename);

  const writer = fs.createWriteStream(filePath);
  const imgResponse = await axios({
    url: ogImage,
    method: 'GET',
    responseType: 'stream',
    headers
  });

  imgResponse.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      const stats = fs.statSync(filePath);
      resolve({
        filePath,
        title: filename,
        mediaType: 'image',
        size: stats.size
      });
    });
    writer.on('error', reject);
  });
}
