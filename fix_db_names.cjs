const fs = require('fs');

let c = fs.readFileSync('storage2.ts', 'utf8');

c = c.replace(/\.from\('materias'\)/g, ".from('courses')");
c = c.replace(/\.from\('lecciones'\)/g, ".from('classes')");
c = c.replace(/\.from\('microtemas'\)/g, ".from('topics')");

c = c.replace(/materia_id/g, 'course_id');
c = c.replace(/leccion_id/g, 'class_id');
c = c.replace(/leccionId/g, 'classId');
c = c.replace(/getLeccionIdFromLesson/g, 'getClassIdFromLesson');
c = c.replace(/LeccionId/g, 'ClassId');
c = c.replace(/leccionData/g, 'classData');
c = c.replace(/newLeccion/g, 'newClass');
c = c.replace(/lecciones\.forEach/g, 'classes.forEach');
c = c.replace(/leccionMap/g, 'classMap');
c = c.replace(/leccionError/g, 'classError');

fs.writeFileSync('storage2.ts', c);
console.log("Done");
