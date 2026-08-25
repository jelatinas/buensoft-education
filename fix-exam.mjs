import { readFileSync, writeFileSync } from 'fs';

let c = readFileSync('geminiService2.ts', 'utf8');

// The generateExam function now uses withRetry but the closing }) was not updated to }))
// Find the pattern and fix it
const oldPattern = "        required: [\"questions\"]\n      }\n    }\n  });";
const newPattern = "        required: [\"questions\"]\n      }\n    }\n  }));";

if (c.includes(oldPattern)) {
  c = c.replace(oldPattern, newPattern);
  writeFileSync('geminiService2.ts', c, 'utf8');
  console.log('Fixed: replaced }); with }));');
} else {
  // Try with \r\n line endings
  const oldPatternCRLF = "        required: [\"questions\"]\r\n      }\r\n    }\r\n  });";
  const newPatternCRLF = "        required: [\"questions\"]\r\n      }\r\n    }\r\n  }));";
  if (c.includes(oldPatternCRLF)) {
    c = c.replace(oldPatternCRLF, newPatternCRLF);
    writeFileSync('geminiService2.ts', c, 'utf8');
    console.log('Fixed CRLF: replaced }); with }));');
  } else {
    // Show what's around line 212
    const lines = c.split('\n');
    console.log('Lines 207-215:');
    lines.slice(206, 215).forEach((l, i) => console.log(`${207+i}: ${JSON.stringify(l)}`));
  }
}
