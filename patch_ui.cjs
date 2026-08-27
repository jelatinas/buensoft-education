const fs = require('fs');

// 1. Patch ExamComponent.tsx for mobile scrolling
let exam = fs.readFileSync('components/ExamComponent.tsx', 'utf8');

// The wrapper in VirtualClassroom is what needs overflow-y-auto. Let's patch VirtualClassroom.tsx
let vc = fs.readFileSync('components/VirtualClassroom.tsx', 'utf8');
const originalVcWrapper = \`      {showExam && (
        <div className={\\\`fixed inset-0 bg-indigo-900/95 z-[3000] flex flex-col p-6 transition-opacity duration-500 \${examReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}\\\`}>\`;
const newVcWrapper = \`      {showExam && (
        <div className={\\\`fixed inset-0 bg-indigo-900/95 z-[3000] flex flex-col p-6 overflow-y-auto transition-opacity duration-500 \${examReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}\\\`}>\`;
if(vc.includes(originalVcWrapper)) {
  vc = vc.replace(originalVcWrapper, newVcWrapper);
  fs.writeFileSync('components/VirtualClassroom.tsx', vc);
}

// 2. Patch StudentDashboard.tsx to include AuditModal
let sd = fs.readFileSync('components/StudentDashboard.tsx', 'utf8');

// Add import
if (!sd.includes("import AuditModal from './AuditModal';")) {
  sd = sd.replace("import React,", "import AuditModal from './AuditModal';\nimport React,");
}

// Add state
const statePattern = /const \[pendingLesson, setPendingLesson\] = useState<Lesson \| null>\(null\);/;
if (sd.match(statePattern)) {
  sd = sd.replace(statePattern, \`const [pendingLesson, setPendingLesson] = useState<Lesson | null>(null);
  const [auditLesson, setAuditLesson] = useState<Lesson | null>(null);\`);
}

// Add the button
const originalButtonPattern = \`                      <button 
                        onClick={() => onHandleLessonClick(lesson)}
                        disabled={ui.disabled}
                        className={\\\`w-full \${ui.color} \${ui.textColor} font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl transition-all disabled:opacity-50\\\`}
                      >
                        {ui.btnText}
                      </button>\`;
const newButtonPattern = \`                      { (status === 'Aprobada' || status === 'Completada') && !isAdminView ? (
                         <div className="grid grid-cols-2 gap-2">
                           <button 
                             onClick={() => onHandleLessonClick(lesson)}
                             disabled={ui.disabled}
                             className={\\\`w-full \${ui.color} \${ui.textColor} text-xs md:text-base font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl transition-all disabled:opacity-50\\\`}
                           >
                             {ui.btnText}
                           </button>
                           <button 
                             onClick={() => setAuditLesson(lesson)}
                             className="w-full bg-slate-800 text-white text-xs md:text-base font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl transition-all hover:bg-slate-700 flex items-center justify-center gap-1"
                           >
                             AUDITAR 🔍
                           </button>
                         </div>
                      ) : (
                         <button 
                           onClick={() => onHandleLessonClick(lesson)}
                           disabled={ui.disabled}
                           className={\\\`w-full \${ui.color} \${ui.textColor} font-black py-4 rounded-2xl uppercase tracking-widest shadow-xl transition-all disabled:opacity-50\\\`}
                         >
                           {ui.btnText}
                         </button>
                      )}\`;

if (sd.includes(originalButtonPattern)) {
  sd = sd.replace(originalButtonPattern, newButtonPattern);
}

// Render the modal at the end of the component
const endPattern = /    <\/div>\s*<\/div>\s*\);\s*};\s*export default StudentDashboard;/;
const modalInject = \`      {auditLesson && (
        <AuditModal 
          lesson={auditLesson} 
          studentId={String(user.id || user.username)} 
          studentUsername={user.username}
          onClose={() => setAuditLesson(null)} 
        />
      )}\`;
if (sd.match(endPattern)) {
  sd = sd.replace(endPattern, \`    </div>
        \${modalInject}
    </div>
  );
};
export default StudentDashboard;\`);
}

fs.writeFileSync('components/StudentDashboard.tsx', sd);
console.log("Patched successfully");
