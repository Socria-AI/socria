// What test/seo renders: the public site's three pages (the homepage, Socria
// One, the Charter) and the student page in both states — from ONE bundle,
// so the shims it is built with apply to all of them.
export { Landing } from '@/components/site/Landing';
export { One } from '@/components/site/One';
export { Charter, CHARTER_TEXT } from '@/components/site/Charter';
export { StudentsBody } from '@/app/students/StudentsBody';
// the guides (components/site/Guide.tsx), each page with its metadata
export { default as SocraticAiPage, metadata as socraticAiMeta } from '@/app/socratic-ai/page';
export { default as ForStudentsPage, metadata as forStudentsMeta } from '@/app/for-students/page';
export { CAPABILITIES_COUNT } from '@/components/site/Landing';
export { ELSEWHERE } from '@/components/site/chrome';
