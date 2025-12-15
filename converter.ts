import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Converts PDF to Docx using python pdf2docx
 */
export async function convertPdfToDocx(inputPath: string, outputDir: string): Promise<string> {
  const outputFilename = path.basename(inputPath, path.extname(inputPath)) + '.docx';
  const outputPath = path.join(outputDir, outputFilename);

  return new Promise((resolve, reject) => {
    // Simple python script inline or call CLI
    // "pdf2docx convert input.pdf output.docx"
    const pythonProcess = spawn('python3', [
      '-c',
      `from pdf2docx import Converter; cv = Converter('${inputPath}'); cv.convert('${outputPath}', start=0, end=None); cv.close()`
    ]);

    let stderr = '';
    pythonProcess.stderr.on('data', d => stderr += d);

    pythonProcess.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`PDF conversion failed: ${stderr}`));
      }
    });
  });
}
