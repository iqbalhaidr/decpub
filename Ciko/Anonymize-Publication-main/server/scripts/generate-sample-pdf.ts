import * as fs from 'fs';
import * as path from 'path';
import { generateSamplePdf } from '../src/manuscripts/utils/sample-generator.util';

async function main() {
  const outputDir = path.join(process.cwd(), 'sample-files');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'dummy_manuscript.pdf');
  
  console.log('Generating dummy PDF manuscript...');
  const pdfBuffer = await generateSamplePdf({
    title: 'Automated Anonymization in Triple-Blind Peer Review',
    authorName: 'Dr. John Example',
    authorEmail: 'john.example@university.edu',
    affiliation: 'Department of Computer Science, Tech University',
    abstract: 'This paper demonstrates the usage of a dummy PDF file generation utility. It ensures that the document produced is valid and can be reliably parsed by the anonymization pipeline, reducing bias via algorithmic identity stripping.',
    keywords: ['Triple-Blind', 'Anonymity', 'Blockchain', 'Testing']
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`Success! Sample PDF generated at: ${outputPath}`);
}

main().catch((err) => {
  console.error('Error generating sample PDF:', err);
  process.exit(1);
});
