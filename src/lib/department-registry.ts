export type Department = {
  slug: string;
  shortName: string;
  name: string;
  description: string;
};

export const DEPARTMENTS: Department[] = [
  { slug: "cse-noticeboard", shortName: "CSE", name: "Computer Science & Engineering", description: "Software, computing, and engineering resources." },
  { slug: "cseaiml-noticeboard", shortName: "CSE AI/ML", name: "CSE — Artificial Intelligence & Machine Learning", description: "Artificial intelligence and machine learning resources." },
  { slug: "cseds-noticeboard", shortName: "CSE DS", name: "CSE — Data Science", description: "Data science, analytics, and related resources." },
  { slug: "csecs-noticeboard", shortName: "CSE CS", name: "CSE — Cyber Security", description: "Cyber security and information assurance resources." },
  { slug: "csit-noticeboard", shortName: "CSIT", name: "Computer Science & Information Technology", description: "Computer science and information technology resources." },
  { slug: "ece-noticeboard", shortName: "ECE", name: "Electronics & Communication Engineering", description: "Electronics, communication, and embedded-system resources." },
  { slug: "eee-noticeboard", shortName: "EEE", name: "Electrical & Electronics Engineering", description: "Electrical, power, and electronics resources." },
  { slug: "eie-noticeboard", shortName: "EIE", name: "Electronics & Instrumentation Engineering", description: "Instrumentation, control, and measurement resources." },
  { slug: "it-noticeboard", shortName: "IT", name: "Information Technology", description: "Information technology, systems, and networking resources." },
  { slug: "mech-noticeboard", shortName: "Mechanical", name: "Mechanical Engineering", description: "Mechanical engineering and manufacturing resources." },
  { slug: "civil-noticeboard", shortName: "Civil", name: "Civil Engineering", description: "Civil engineering, construction, and infrastructure resources." },
  { slug: "exams-noticeboard", shortName: "Exams", name: "Examinations", description: "Examination notices, schedules, and academic documents." },
  { slug: "gen-noticeboard", shortName: "General", name: "General Notices", description: "College-wide announcements and general resources." },
  { slug: "hns-noticeboard", shortName: "H&S", name: "Humanities & Sciences", description: "Humanities, sciences, and common-course resources." },
  { slug: "et-noticeboard", shortName: "ET", name: "Engineering Technology", description: "Engineering technology and interdisciplinary resources." },
];

export function getDepartment(slug: string): Department | null {
  return DEPARTMENTS.find((department) => department.slug === slug) ?? null;
}
