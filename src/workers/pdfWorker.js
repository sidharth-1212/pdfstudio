import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';

self.onmessage = async (e) => {
  const { action, files, file, selectedIndices, password, pageRotations, watermarkText } = e.data;

  try {
    if (action === 'merge') {
      const mergedPdf = await PDFDocument.create();
      for (const fileBuffer of files) {
        const pdf = await PDFDocument.load(fileBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
      const bytes = await mergedPdf.save();
      self.postMessage({ status: 'success', data: bytes });
    } 
    
    else if (action === 'extract' || action === 'reorder') {
      const originalPdf = await PDFDocument.load(file);
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(originalPdf, selectedIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));
      const bytes = await newPdf.save();
      self.postMessage({ status: 'success', data: bytes });
    }

    else if (action === 'rotate') {
      const pdf = await PDFDocument.load(file);
      const pages = pdf.getPages();
      for (const [strIndex, addedAngle] of Object.entries(pageRotations)) {
        const idx = parseInt(strIndex, 10);
        const page = pages[idx];
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(currentRotation + addedAngle));
      }
      const bytes = await pdf.save();
      self.postMessage({ status: 'success', data: bytes });
    }

    else if (action === 'protect') {
      const pdf = await PDFDocument.load(file);
      const cleanBytes = await pdf.save();
      const encryptedBytes = await encryptPDF(new Uint8Array(cleanBytes), password);
      self.postMessage({ status: 'success', data: encryptedBytes });
    }

    else if (action === 'watermark') {
      const pdf = await PDFDocument.load(file);
      const helveticaFont = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pages = pdf.getPages();
      pages.forEach(page => {
        const { width, height } = page.getSize();
        const fontSize = 60;
        const textWidth = helveticaFont.widthOfTextAtSize(watermarkText, fontSize);
        page.drawText(watermarkText, {
          x: width / 2 - textWidth / 2, y: height / 2 - textWidth / 2,
          size: fontSize, font: helveticaFont, color: rgb(0.6, 0.6, 0.6), opacity: 0.4, rotate: degrees(45),
        });
      });
      const bytes = await pdf.save();
      self.postMessage({ status: 'success', data: bytes });
    }

    else if (action === 'pageNumbers') {
      const pdf = await PDFDocument.load(file);
      const helveticaFont = await pdf.embedFont(StandardFonts.Helvetica);
      const pages = pdf.getPages();
      pages.forEach((page, index) => {
        const { width } = page.getSize();
        const text = `Page ${index + 1} of ${pages.length}`;
        const textWidth = helveticaFont.widthOfTextAtSize(text, 11);
        page.drawText(text, { x: width / 2 - textWidth / 2, y: 30, size: 11, font: helveticaFont, color: rgb(0, 0, 0) });
      });
      const bytes = await pdf.save();
      self.postMessage({ status: 'success', data: bytes });
    }

    else if (action === 'sign') {
      const { placedSignatures } = e.data;
      const pdf = await PDFDocument.load(file);
      const pages = pdf.getPages();
      const embeddedImages = {};
      
      for (const sig of placedSignatures) {
        const safePageIndex = Math.max(0, Math.min(sig.pageIndex, pages.length - 1));
        const page = pages[safePageIndex]; 
        let pngImage = embeddedImages[sig.image];
        if (!pngImage) {
          const signatureBytes = await fetch(sig.image).then(res => res.arrayBuffer());
          pngImage = await pdf.embedPng(signatureBytes);
          embeddedImages[sig.image] = pngImage;
        }
        page.drawImage(pngImage, { x: sig.x, y: sig.y, width: sig.width, height: sig.height });
      }
      const bytes = await pdf.save();
      self.postMessage({ status: 'success', data: bytes });
    }
    
  } catch (error) {
    self.postMessage({ status: 'error', error: error.message });
  }
};