import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  BaileysEventMap,
  WASocket,
  ConnectionState,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { downloadMedia } from './download';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { consultCep, checkLinkSafety } from './features';
import { convertPdfToDocx } from './converter';
import * as mime from 'mime-types';

dotenv.config();

const PORT = process.env.PORT || 3000;

// Directory to store auth state - essential for persistent login
const AUTH_DIR = 'auth_info_baileys';
const TEMP_DIR = 'temp_downloads';

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// State Management for Interactive Flows
const userStates = new Map<string, { url: string, step: string }>();

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// CRON: Cleanup temp files every 30 minutes
cron.schedule('*/30 * * * *', () => {
  console.log('Running auto-cleanup of temp files...');
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        // Delete if older than 1 hour (3600000 ms)
        if (now - stats.mtimeMs > 3600000) {
          fs.unlink(filePath, () => console.log(`Deleted expired file: ${file}`));
        }
      });
    });
  });
});

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }) as any,
    printQRInTerminal: false,
    auth: state,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Scan the QR Code below to log in:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('Opened connection to WhatsApp!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      for (const msg of messages) {
        if (!msg.message) continue;

        const remoteJid = msg.key.remoteJid;
        const pushName = msg.pushName || 'Unknown';

        if (!remoteJid) continue;
        if (remoteJid === 'status@broadcast') continue;
        if (msg.key.fromMe) continue;

        // Determine message type and content
        const textContent = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const documentMessage = msg.message.documentMessage;

        // Save user to Supabase
        if (supabaseUrl && supabaseKey) {
          console.log(`Attempting to save user ${remoteJid} to Supabase...`);
          try {
            const { data, error } = await supabase.from('users').upsert({
              phone: remoteJid,
              name: pushName,
              last_active: new Date().toISOString()
            }, { onConflict: 'phone' });

            if (error) {
              console.error('Supabase UPSERT Error:', error);
            } else {
              console.log('User saved to Supabase successfully.');
            }
          } catch (err) {
            console.error('Supabase Unexpected Error:', err);
          }
        } else {
          console.warn('Supabase keys missing. Skipping DB save.');
        }
        console.log(`Received message from ${remoteJid}: ${textContent || 'Document/Media'}`);

        // --- 1. Text Commands (CEP, Link Check, Menu) ---
        if (textContent) {
          // Menu Command
          if (textContent.toLowerCase() === '!menu' || textContent.toLowerCase() === '!ajuda') {
            const menuText = `🤖 *Atlas Bot - Menu de Ajuda* 🤖\n\n` +
              `Aqui está o que eu posso fazer por você:\n\n` +
              `🎬 *Baixar Mídias*\n` +
              `Envie links do *YouTube, Instagram, TikTok, Pinterest, Twitter* ou *Reddit* para baixar vídeos ou imagens.\n\n` +
              `📄 *Converter PDF para Word*\n` +
              `Apenas envie um arquivo PDF e eu transformo em .docx para você.\n\n` +
              `📍 *Consultar CEP*\n` +
              `Use: \`!cep 01001000\`\n\n` +
              `🔗 *Verificar Links*\n` +
              `Use: \`!check <link>\` para ver se é seguro.\n\n` +
              `_Desenvolvido para facilitar sua vida!_ 🚀`;

            await sock.sendMessage(remoteJid, { text: menuText }, { quoted: msg });
            return;
          }

          // CEP Command
          if (textContent.startsWith('!cep ')) {
            const cep = textContent.replace('!cep ', '').trim();
            try {
              const result = await consultCep(cep);
              await sock.sendMessage(remoteJid, { text: result }, { quoted: msg });
            } catch (err: any) {
              await sock.sendMessage(remoteJid, { text: `❌ *Erro:* ${err.message}` }, { quoted: msg });
            }
            return; // Stop processing
          }

          // Check Link Command
          if (textContent.startsWith('!check ')) {
            const link = textContent.replace('!check ', '').trim();
            const result = await checkLinkSafety(link);
            await sock.sendMessage(remoteJid, { text: result }, { quoted: msg });
            return; // Stop processing
          }
        }

        // --- 2. PDF to Docx Conversion ---
        if (documentMessage && documentMessage.mimetype === 'application/pdf') {
          try {
            await sock.sendMessage(remoteJid, { react: { text: "⚙️", key: msg.key } });

            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              {}
            );

            if (!Buffer.isBuffer(buffer)) throw new Error('Falha ao baixar mídia');

            const inputFilename = `${Date.now()}_${documentMessage.fileName || 'file.pdf'}`;
            const inputPath = path.join(TEMP_DIR, inputFilename);

            fs.writeFileSync(inputPath, buffer);

            // Convert
            const outputDocxPath = await convertPdfToDocx(inputPath, TEMP_DIR);
            const cleanDocName = path.basename(outputDocxPath).replace(/^\d+_/, '');

            // Send back
            await sock.sendMessage(remoteJid, {
              document: fs.readFileSync(outputDocxPath),
              mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              fileName: cleanDocName,
              caption: '📄 *Aqui está seu arquivo Word convertido!*'
            }, { quoted: msg });

            await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

            fs.unlinkSync(inputPath);

          } catch (err: any) {
            console.error('Conversion error:', err);
            await sock.sendMessage(remoteJid, { text: `❌ *Falha na Conversão:* ${err.message}` }, { quoted: msg });
          }
          return;
        }
        // --- 3. Media Download Logic (Original + Dedupe) ---

        // State Manager
        const userState = userStates.get(remoteJid);

        // HANDLE PENDING STATE (User replying to choice)
        if (userState && userState.step === 'AWAITING_FORMAT') {
          if (textContent === '1' || textContent.toLowerCase() === 'audio') {
            // Audio
            await sock.sendMessage(remoteJid, { text: "🎵 Baixando áudio... Aprox. 30s" }, { quoted: msg });
            await handleDownload(userState.url, 'audio', remoteJid, msg, sock);
            userStates.delete(remoteJid);
            return;
          } else if (textContent === '2' || textContent.toLowerCase() === 'video') {
            // Video
            await sock.sendMessage(remoteJid, { text: "📹 Baixando vídeo... Aprox. 30s" }, { quoted: msg });
            await handleDownload(userState.url, 'video', remoteJid, msg, sock);
            userStates.delete(remoteJid);
            return;
          } else {
            // Cancel or invalid
            await sock.sendMessage(remoteJid, { text: "❌ Opção inválida. Cancelado. Envie o link novamente." }, { quoted: msg });
            userStates.delete(remoteJid);
            return;
          }
        }

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = textContent.match(urlRegex);

        if (urls && urls.length > 0) {
          const urlToDownload = urls[0];

          // Check if it is YouTube
          const isYouTube = urlToDownload.includes('youtube.com') || urlToDownload.includes('youtu.be');

          if (isYouTube) {
            // Trigger Interactive Flow
            userStates.set(remoteJid, { url: urlToDownload, step: 'AWAITING_FORMAT' });
            await sock.sendMessage(remoteJid, {
              text: `🎞️ *YouTube Detectado*\n\nComo você deseja baixar?\n\n1️⃣ *Áudio* (MP3)\n2️⃣ *Vídeo* (MP4)\n\n_Responda com 1 ou 2_`
            }, { quoted: msg });
            return;
          }

          // Other links (Instagram, TikTok, etc) -> Automatic Download (Video/Image)
          console.log(`Found URL: ${urlToDownload}, starting download...`);
          await handleDownload(urlToDownload, 'video', remoteJid, msg, sock);
        }
      }
    }
  });
}

// Helper to keep code clean since we call it from two places
async function handleDownload(url: string, format: 'video' | 'audio', remoteJid: string, msg: any, sock: any) {
  try {
    await sock.sendMessage(remoteJid, { react: { text: "⏳", key: msg.key } });

    const { filePath, title, mediaType, size } = await downloadMedia(url, TEMP_DIR, format);

    if (fs.existsSync(filePath)) {
      console.log(`Sending file: ${filePath} (${mediaType}, size: ${size})`);

      const MAX_VIDEO_SIZE = 60 * 1024 * 1024;
      const cleanTitle = title.replace(/^\d+_/, '');

      if (size > MAX_VIDEO_SIZE) {
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';
        await sock.sendMessage(remoteJid, {
          document: fs.readFileSync(filePath),
          mimetype: mimeType,
          fileName: cleanTitle,
          caption: `📁 *Arquivo Grande*\n\nO arquivo tem ${(size / 1024 / 1024).toFixed(2)} MB, enviado como documento.`
        }, { quoted: msg });
      } else {
        if (mediaType === 'video') {
          await sock.sendMessage(remoteJid, {
            video: fs.readFileSync(filePath),
            caption: `🎥 *Aqui está seu vídeo!*`
          }, { quoted: msg });
        } else if (mediaType === 'image') {
          await sock.sendMessage(remoteJid, {
            image: fs.readFileSync(filePath),
            caption: `🖼️ *Aqui está sua imagem!*`
          }, { quoted: msg });
        } else if (format === 'audio' || filePath.endsWith('.mp3')) {
          await sock.sendMessage(remoteJid, {
            audio: fs.readFileSync(filePath),
            mimetype: 'audio/mp4', // WhatsApp is picky, audio/mp4 often works best for PTT or audio files
            caption: `🎵 *Aqui está seu áudio!*`
          }, { quoted: msg });
        } else {
          await sock.sendMessage(remoteJid, {
            document: fs.readFileSync(filePath),
            mimetype: 'application/octet-stream',
            fileName: cleanTitle
          }, { quoted: msg });
        }
      }

      await sock.sendMessage(remoteJid, { react: { text: "✅", key: msg.key } });

    } else {
      throw new Error('Arquivo não encontrado após download');
    }

  } catch (error: any) {
    console.error('Error downloading/sending:', error);
    // Extract cleanly
    let safeError = error.message;
    if (safeError.includes('deprecated')) safeError = "Atualização de servidor necessária (Python).";
    if (safeError.includes('yt-dlp exited with code 1')) safeError = "Conteúdo privado ou indisponível.";

    await sock.sendMessage(remoteJid, { text: `❌ *Falha no Download*\n\nMotivo: _${safeError}_` }, { quoted: msg });
    await sock.sendMessage(remoteJid, { react: { text: "❌", key: msg.key } });
  }
}

// Handle graceful shutdown (Ctrl+C)
// Handle graceful shutdown (Ctrl+C)
process.on('SIGINT', () => {
  console.log('Encerrando bot...');
  process.exit(0);
});

import http from 'http';
// Basic HTTP server for Heroku
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Atlas Bot Online');
}).listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

connectToWhatsApp().catch(err => console.log('Unexpected error:', err));
