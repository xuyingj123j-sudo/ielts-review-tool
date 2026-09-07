'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ReviewDatabase } = require('../src/db');

function decodeHtml(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}

function htmlToLines(value) {
  return decodeHtml(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCambridgeListeningHtml(html) {
  const blocks = [...html.matchAll(/<div\s+class=["']part["']\s*>([\s\S]*?)(?=<div\s+class=["']part["']\s*>|<\/body>)/gi)];
  const sections = [];
  for (const match of blocks) {
    const headingHtml = match[1].match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '';
    const heading = htmlToLines(headingHtml).join(' ');
    const titleMatch = heading.match(/^Test\s+1\s*·\s*Part\s+([1-4])\s*\|\s*(.+)$/i);
    if (!titleMatch) continue;
    const sectionNumber = Number(titleMatch[1]);
    const lines = htmlToLines(match[1].match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1] || '');
    const compact = (value) => value.replace(/\s+/g, '');
    const transcriptMarker = `剑桥雅思16Test1Part${sectionNumber}`;
    const markerIndex = lines.findIndex((line) => compact(line) === transcriptMarker);
    const transcriptStart = lines.findIndex((line, index) => index > markerIndex && index <= markerIndex + 3 && compact(line) === '原文');
    const answerPattern = new RegExp(`^${transcriptMarker}(?:雅思)?听力答案$`);
    const answerIndex = lines.findIndex((line, index) => index > transcriptStart && answerPattern.test(compact(line)));
    if (markerIndex < 0 || transcriptStart < 0 || answerIndex <= transcriptStart + 1) {
      throw new Error(`Test1 Part${sectionNumber} 未找到可识别的原文/答案边界（marker=${markerIndex}, transcript=${transcriptStart}, answer=${answerIndex}, lines=${lines.length}）`);
    }
    sections.push({
      sectionNumber,
      title: titleMatch[2].trim(),
      audioPath: `/listening-audio/Test1_Part${sectionNumber}.mp3`,
      transcriptText: lines.slice(transcriptStart + 1, answerIndex).join('\n'),
      answerKeyText: lines.slice(answerIndex + 1).join('\n')
    });
  }
  sections.sort((left, right) => left.sectionNumber - right.sectionNumber);
  if (sections.length !== 4 || sections.some((section, index) => section.sectionNumber !== index + 1)) {
    throw new Error(`预期解析 Test1 Part1-4 共4段，实际得到 ${sections.length} 段`);
  }
  return sections;
}

function runImport(options = {}) {
  const projectRoot = path.join(__dirname, '..');
  const sourceRoot = options.sourceRoot || 'D:\\XZ\\雅思学习资料\\剑16';
  const htmlPath = options.htmlPath || path.join(sourceRoot, '剑16_听力原文与答案.html');
  const audioSourceDir = options.audioSourceDir || path.join(sourceRoot, '音频');
  const audioTargetDir = options.audioTargetDir || path.join(projectRoot, 'data', 'audio');
  const dbPath = options.dbPath || process.env.DB_PATH || path.join(projectRoot, 'data', 'ielts.db');
  const sections = parseCambridgeListeningHtml(fs.readFileSync(htmlPath, 'utf8'));
  fs.mkdirSync(audioTargetDir, { recursive: true });
  for (const section of sections) {
    const filename = `Test1_Part${section.sectionNumber}.mp3`;
    fs.copyFileSync(path.join(audioSourceDir, filename), path.join(audioTargetDir, filename));
  }
  const database = new ReviewDatabase(dbPath);
  try {
    database.importListeningTest({ sourceBook: '剑16', testNumber: 1, sections });
  } finally {
    database.close();
  }
  return sections;
}

if (require.main === module) {
  const sections = runImport();
  console.log(`已导入 剑16 Test1：${sections.map((section) => `Part${section.sectionNumber} ${section.title}`).join('；')}`);
  console.log('版权素材仅写入已忽略的 data/ielts.db 与 data/audio/。');
}

module.exports = { parseCambridgeListeningHtml, runImport };
