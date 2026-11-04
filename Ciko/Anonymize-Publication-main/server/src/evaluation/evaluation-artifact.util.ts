import * as fs from 'fs';
import * as path from 'path';

export function writeEvaluationArtifact(suiteName: string, testName: string, metrics: any) {
  const outputDir = path.join(process.cwd(), 'test-results', 'evaluation');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  // Sanitize suiteName and testName for filename
  const safeSuiteName = suiteName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${safeSuiteName}_metrics.json`;
  const filePath = path.join(outputDir, filename);

  const payload = {
    suite: suiteName,
    scenario: testName,
    generatedAt: timestamp,
    metrics,
    notes: "Artifact generated automatically for thesis evaluation chapter."
  };

  let existingData = [];
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      existingData = JSON.parse(content);
      if (!Array.isArray(existingData)) {
        existingData = [existingData];
      }
    } catch (e) {
      existingData = [];
    }
  }

  existingData.push(payload);
  fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');

  // Optional: Also append to a CSV file
  const csvFilename = `${safeSuiteName}_metrics.csv`;
  const csvFilePath = path.join(outputDir, csvFilename);
  const isNewCsv = !fs.existsSync(csvFilePath);
  
  try {
    const flatMetrics = flattenObject(metrics);
    const headers = ['timestamp', 'suiteName', 'testName', ...Object.keys(flatMetrics)];
    const row = [timestamp, suiteName, testName, ...Object.values(flatMetrics)];
    
    let csvContent = '';
    if (isNewCsv) {
      csvContent += headers.join(',') + '\n';
    }
    csvContent += row.map(v => typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v).join(',') + '\n';
    
    fs.appendFileSync(csvFilePath, csvContent, 'utf8');
  } catch (e) {
    console.error('Failed to write CSV artifact', e);
  }
}

function flattenObject(ob: any): any {
  var toReturn: any = {};
  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;
    if ((typeof ob[i]) == 'object' && ob[i] !== null) {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;
        toReturn[i + '.' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}
