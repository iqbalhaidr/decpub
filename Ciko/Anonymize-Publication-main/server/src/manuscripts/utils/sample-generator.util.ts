import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface SamplePdfOptions {
  title?: string;
  authorName?: string;
  authorEmail?: string;
  affiliation?: string;
  abstract?: string;
  keywords?: string[];
}

export async function generateSamplePdf(options?: SamplePdfOptions): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 size
  
  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const textFont = await doc.embedFont(StandardFonts.Helvetica);

  const title = options?.title || 'Sample Manuscript Title';
  const authorName = options?.authorName || 'Dr. Jane Doe';
  const authorEmail = options?.authorEmail || 'jane.doe@example.com';
  const affiliation = options?.affiliation || 'University of Anonymous Research';
  const abstract = options?.abstract || 'This is a sample abstract for the manuscript. It describes the purpose of this dummy document which is used for testing the anonymity mechanisms and intake processing features.';
  const keywords = options?.keywords || ['Anonymity', 'Blockchain', 'Peer Review', 'Mock'];

  // Set Metadata
  doc.setTitle(title);
  doc.setAuthor(authorName);
  doc.setSubject('Scientific Manuscript');
  doc.setKeywords(keywords);
  doc.setProducer('Sample Generator Utility');
  doc.setCreator(authorName);

  let y = 750;

  page.drawText(title, { x: 50, y, size: 20, font: titleFont, color: rgb(0, 0, 0) });
  y -= 40;

  page.drawText(authorName, { x: 50, y, size: 14, font: textFont });
  y -= 20;

  page.drawText(affiliation, { x: 50, y, size: 12, font: textFont });
  y -= 20;

  page.drawText(authorEmail, { x: 50, y, size: 12, font: textFont, color: rgb(0, 0, 1) });
  y -= 50;

  page.drawText('Abstract', { x: 50, y, size: 16, font: titleFont });
  y -= 30;

  // Simple wrap text logic for abstract
  const words = abstract.split(' ');
  let line = '';
  for (const word of words) {
    if (line.length + word.length > 80) {
      page.drawText(line, { x: 50, y, size: 12, font: textFont });
      y -= 20;
      line = word + ' ';
    } else {
      line += word + ' ';
    }
  }
  if (line.trim().length > 0) {
    page.drawText(line, { x: 50, y, size: 12, font: textFont });
    y -= 30;
  }

  page.drawText(`Keywords: ${keywords.join(', ')}`, { x: 50, y, size: 12, font: textFont, color: rgb(0.3, 0.3, 0.3) });
  
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
