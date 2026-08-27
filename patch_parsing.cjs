const fs = require('fs');

let vc = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');

const originalProcessAI = `const processAIResponse = (rawText: string): string => {
  let aiText = rawText;
  const dataMatch = aiText.match(/\\[DATA_LOGICA\\]([\\s\\S]*?)\\[\\/DATA_LOGICA\\]/);
  if (dataMatch) {
     try {
        const data = JSON.parse(dataMatch[1].trim());
        if (data.type === 'MCQ' && Array.isArray(data.options)) {
           const shuffled = [...data.options];
           for (let i = shuffled.length - 1; i > 0; i--) {
             const j = Math.floor(Math.random() * (i + 1));
             [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
           }
           data.options = shuffled;
           const newDataLogica = \`[DATA_LOGICA]\\n\${JSON.stringify(data)}\\n[/DATA_LOGICA]\`;
           aiText = aiText.replace(dataMatch[0], newDataLogica);
        }
     } catch (e) {
        console.error("Error shuffling options:", e);
     }
  }
  return aiText;
};`;

const newProcessAI = `const processAIResponse = (rawText: string): string => {
  let aiText = rawText;
  let dataMatch = aiText.match(/\\[DATA_LOGICA\\]([\\s\\S]*?)\\[\\/DATA_LOGICA\\]/);
  if (!dataMatch) {
      dataMatch = aiText.match(/\\[DATA_LOGICA\\]([\\s\\S]*)$/);
  }
  
  if (dataMatch) {
     try {
        let jsonStr = dataMatch[1].trim();
        if (jsonStr.startsWith('\`\`\`json')) jsonStr = jsonStr.replace(/\`\`\`json|\`\`\`/g, '').trim();
        else if (jsonStr.startsWith('\`\`\`')) jsonStr = jsonStr.replace(/\`\`\`/g, '').trim();
        
        const jsonMatch = jsonStr.match(/(\\{[\\s\\S]*?\\})/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        
        const data = JSON.parse(jsonStr);
        if (data.type === 'MCQ' && Array.isArray(data.options)) {
           const shuffled = [...data.options];
           for (let i = shuffled.length - 1; i > 0; i--) {
             const j = Math.floor(Math.random() * (i + 1));
             [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
           }
           data.options = shuffled;
        }
        
        const newDataLogica = \`[DATA_LOGICA]\\n\${JSON.stringify(data)}\\n[/DATA_LOGICA]\`;
        aiText = aiText.replace(dataMatch[0], newDataLogica);
     } catch (e) {
        console.error("Error processing AI response:", e);
     }
  }
  return aiText;
};`;

if (vc.includes(originalProcessAI)) {
  vc = vc.replace(originalProcessAI, newProcessAI);
  console.log("Patched processAIResponse successfully");
} else {
  console.log("Could not find processAIResponse block");
}

// Now patch renderMessageContent
const originalRenderDataMatch = `    let dataMatch = text.match(/\\[DATA_LOGICA\\]([\\s\\S]*?)\\[\\/DATA_LOGICA\\]/);
    
    if (!dataMatch) {
      const fallbackMatch = text.match(/(\\{[\\s\\S]*?\\})\\s*\\[\\/DATA_LOGICA\\]/);
      if (fallbackMatch) {
        dataMatch = [fallbackMatch[0], fallbackMatch[1]];
      }
    }`;

const newRenderDataMatch = `    let dataMatch = text.match(/\\[DATA_LOGICA\\]([\\s\\S]*?)\\[\\/DATA_LOGICA\\]/);
    
    if (!dataMatch) {
      const fallbackMatch = text.match(/(\\{[\\s\\S]*?\\})\\s*\\[\\/DATA_LOGICA\\]/);
      if (fallbackMatch) {
        dataMatch = [fallbackMatch[0], fallbackMatch[1]];
      } else {
        const fallbackMatch2 = text.match(/\\[DATA_LOGICA\\]\\s*(\\{[\\s\\S]*?\\})\\s*(?:\\[\\/DATA_LOGICA\\]|$)/);
        if (fallbackMatch2) {
           dataMatch = [fallbackMatch2[0], fallbackMatch2[1]];
        }
      }
    }`;

if (vc.includes(originalRenderDataMatch)) {
  vc = vc.replace(originalRenderDataMatch, newRenderDataMatch);
  console.log("Patched renderMessageContent successfully");
} else {
  console.log("Could not find renderMessageContent block");
}

// And replace trailing [DATA_LOGICA]... in explanation cleaning
const originalExplanationClean = `    explanation = explanation
      .replace(/\\[DATA_LOGICA\\][\\s\\S]*?\\[\\/DATA_LOGICA\\]/g, '')
      .replace(/\\{[\\s\\S]*?\\}\\s*\\[\\/DATA_LOGICA\\]/g, '')`;

const newExplanationClean = `    explanation = explanation
      .replace(/\\[DATA_LOGICA\\][\\s\\S]*?\\[\\/DATA_LOGICA\\]/g, '')
      .replace(/\\{[\\s\\S]*?\\}\\s*\\[\\/DATA_LOGICA\\]/g, '')
      .replace(/\\[DATA_LOGICA\\][\\s\\S]*$/g, '')`;

if (vc.includes(originalExplanationClean)) {
  vc = vc.replace(originalExplanationClean, newExplanationClean);
  console.log("Patched explanation cleaning successfully");
} else {
  console.log("Could not find explanation cleaning block");
}

fs.writeFileSync('components/VirtualClassroom.tsx', vc);
