'use strict';

const CATEGORIES = Object.freeze(['number', 'date', 'time', 'money', 'phone']);
const MODES = Object.freeze(['standalone', 'dialogue', 'exam']);
const CURRENCIES = Object.freeze([
  Object.freeze({ symbol: '£', major: 'pounds', minor: 'pence' }),
  Object.freeze({ symbol: '$', major: 'dollars', minor: 'cents' })
]);

const ONES = Object.freeze([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'
]);
const TENS = Object.freeze(['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']);
const MONTHS = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]);

const DIALOGUE_TEMPLATES = Object.freeze({
  mixed: Object.freeze({ category: null, templates: Object.freeze(['The number mentioned was {V}.', 'Please make a note of {V}.']) }),
  general: Object.freeze({ category: 'number', templates: Object.freeze(['There are {V} students enrolled in the course this year.', 'The workshop had {V} participants in total.']) }),
  money: Object.freeze({ category: 'money', templates: Object.freeze(['The total comes to {V}.', 'She paid {V} for the repair.']) }),
  phone: Object.freeze({ category: 'phone', templates: Object.freeze(['You can reach the office on {V}.', 'My new number is {V}.']) }),
  birthday: Object.freeze({ category: 'date', templates: Object.freeze(['Her birthday is on {V}.', 'His birthday falls on {V}.']) }),
  date_of_birth: Object.freeze({ category: 'date', templates: Object.freeze(['My date of birth is {V}.', 'He was born on {V}.']) }),
  deadline: Object.freeze({ category: 'date', templates: Object.freeze(['The application deadline is {V}.', 'Please submit your form by {V}.']) }),
  anniversary: Object.freeze({ category: 'date', templates: Object.freeze(['Their wedding anniversary is on {V}.', 'They celebrate their anniversary on {V}.']) }),
  movie_release: Object.freeze({ category: 'date', templates: Object.freeze(['The film will be released on {V}.', 'The movie comes out on {V}.']) }),
  date: Object.freeze({ category: 'date', templates: Object.freeze(['The meeting is scheduled for {V}.', 'The event will take place on {V}.']) })
});

const DIALOGUE_SUBTYPES = Object.freeze(Object.keys(DIALOGUE_TEMPLATES));
const CONCRETE_DIALOGUE_SUBTYPES = Object.freeze(DIALOGUE_SUBTYPES.filter((subtype) => subtype !== 'mixed'));

function numberToWords(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 999) throw new RangeError('numberToWords 仅支持 0-999 的整数');
  if (number < 20) return ONES[number];
  if (number < 100) {
    const rest = number % 10;
    return `${TENS[Math.floor(number / 10)]}${rest ? `-${ONES[rest]}` : ''}`;
  }
  const rest = number % 100;
  return `${ONES[Math.floor(number / 100)]} hundred${rest ? ` and ${numberToWords(rest)}` : ''}`;
}

function ordinal(day) {
  const direct = {
    1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth',
    7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh',
    12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
    16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth',
    20: 'twentieth', 30: 'thirtieth'
  };
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new RangeError('日期必须在 1-31 之间');
  if (direct[day]) return direct[day];
  const prefix = day < 30 ? 'twenty' : 'thirty';
  return `${prefix}-${direct[day % 10]}`;
}

function yearToWords(year) {
  if (!Number.isInteger(year) || year < 1960 || year > 2035) throw new RangeError('年份必须在 1960-2035 之间');
  if (year === 2000) return 'two thousand';
  if (year > 2000 && year < 2010) return `two thousand and ${numberToWords(year - 2000)}`;
  return `${numberToWords(Math.floor(year / 100))} ${numberToWords(year % 100)}`;
}

function randomInteger(min, max, random) {
  return min + Math.floor(random() * (max - min + 1));
}

function pick(values, random) {
  return values[Math.floor(random() * values.length)];
}

function dateParts(random) {
  const year = randomInteger(1960, 2035, random);
  const month = randomInteger(1, 12, random);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { day: randomInteger(1, maxDay, random), month, year };
}

function standaloneQuestion(category, random) {
  if (category === 'number') {
    const digits = randomInteger(2, 7, random);
    const lower = 10 ** (digits - 1);
    const value = String(randomInteger(lower, (10 ** digits) - 1, random));
    return { category, spokenText: value, correctAnswer: value };
  }
  if (category === 'date') {
    const { day, month, year } = dateParts(random);
    return {
      category,
      spokenText: `the ${ordinal(day)} of ${MONTHS[month - 1]}, ${yearToWords(year)}`,
      correctAnswer: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
  if (category === 'time') {
    const hour = randomInteger(0, 23, random);
    const minute = pick(Array.from({ length: 12 }, (_, index) => index * 5), random);
    const h12 = (hour % 12) || 12;
    const nextH12 = ((hour + 1) % 12) || 12;
    let phrase;
    if (minute === 0) phrase = `${numberToWords(h12)} o'clock`;
    else if (minute === 15) phrase = `quarter past ${numberToWords(h12)}`;
    else if (minute === 30) phrase = `half past ${numberToWords(h12)}`;
    else if (minute === 45) phrase = `quarter to ${numberToWords(nextH12)}`;
    else if (minute < 30) phrase = `${numberToWords(minute)} past ${numberToWords(h12)}`;
    else phrase = `${numberToWords(60 - minute)} to ${numberToWords(nextH12)}`;
    const period = hour < 12 ? 'in the morning' : hour < 18 ? 'in the afternoon' : 'in the evening';
    return {
      category,
      spokenText: `${phrase} ${period}`,
      correctAnswer: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
  }
  if (category === 'money') {
    const currency = pick(CURRENCIES, random);
    const majorValue = randomInteger(1, 500, random);
    const minorValue = random() < 0.5 ? 0 : randomInteger(1, 99, random);
    const minorPhrase = minorValue ? ` and ${numberToWords(minorValue)} ${currency.minor}` : '';
    return {
      category,
      spokenText: `${numberToWords(majorValue)} ${currency.major}${minorPhrase}`,
      correctAnswer: `${currency.symbol}${majorValue}.${String(minorValue).padStart(2, '0')}`
    };
  }
  const value = `07${Array.from({ length: 9 }, () => randomInteger(0, 9, random)).join('')}`;
  return {
    category: 'phone',
    spokenText: [...value].map((digit) => ONES[Number(digit)]).join(', '),
    correctAnswer: value
  };
}

function generateQuestion({ category, subtype = null, mode = 'standalone', now = new Date(), random = Math.random } = {}) {
  if (!MODES.includes(mode)) throw new RangeError('无效的数字听力模式');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('now 必须是有效日期');
  if (typeof random !== 'function') throw new TypeError('random 必须是函数');

  let resolvedSubtype = subtype;
  let resolvedCategory = category;
  if (mode === 'dialogue') {
    if (!DIALOGUE_SUBTYPES.includes(subtype)) throw new RangeError('无效的对话测验类型');
    resolvedSubtype = subtype === 'mixed' ? pick(CONCRETE_DIALOGUE_SUBTYPES, random) : subtype;
    resolvedCategory = DIALOGUE_TEMPLATES[resolvedSubtype].category;
  }
  if (!CATEGORIES.includes(resolvedCategory)) throw new RangeError('无效的数字听力类别');

  const base = standaloneQuestion(resolvedCategory, random);
  if (mode !== 'dialogue') {
    return { ...base, subtype: null, mode, promptText: null };
  }
  const template = pick(DIALOGUE_TEMPLATES[resolvedSubtype].templates, random);
  const promptText = template.replaceAll('{V}', base.spokenText);
  return { ...base, subtype: resolvedSubtype, mode, spokenText: promptText, promptText };
}

function validDate(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

function gradeAnswer({ category, correctAnswer, userAnswer }) {
  if (!CATEGORIES.includes(category) || typeof correctAnswer !== 'string' || typeof userAnswer !== 'string') return false;
  if (category === 'number' || category === 'phone') {
    return userAnswer.replace(/\D/g, '') === correctAnswer;
  }
  if (category === 'date') {
    const parts = userAnswer.trim().split(/[\/\.\-\s]+/).filter(Boolean);
    if (parts.length !== 3 || parts.some((part) => !/^\d{1,4}$/.test(part))) return false;
    let year;
    let month;
    let day;
    if (parts[0].length === 4) [year, month, day] = parts.map(Number);
    else {
      [day, month, year] = parts.map(Number);
      if (parts[2].length === 2) year += year <= 35 ? 2000 : 1900;
    }
    if (!validDate(year, month, day)) return false;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` === correctAnswer;
  }
  if (category === 'time') {
    const match = userAnswer.trim().toLowerCase().match(/^(\d{1,2})\s*:\s*(\d{2})\s*(am|pm)?$/);
    if (!match) return false;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59) return false;
    if (match[3]) {
      if (hour < 1 || hour > 12) return false;
      hour = (hour % 12) + (match[3] === 'pm' ? 12 : 0);
    } else if (hour > 23) return false;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` === correctAnswer;
  }
  const amount = userAnswer.replace(/[£$€ ,]/g, '').replace(/pounds?|dollars?|euros?|pence|cents?/gi, '').trim();
  const normalized = amount.match(/^\d+(?:\.\d+)?$/);
  const expected = correctAnswer.match(/\d+(?:\.\d+)?/);
  if (!normalized || !expected) return false;
  return Math.round(Number(normalized[0]) * 100) === Math.round(Number(expected[0]) * 100);
}

module.exports = {
  CATEGORIES,
  MODES,
  CURRENCIES,
  DIALOGUE_SUBTYPES,
  DIALOGUE_TEMPLATES,
  generateQuestion,
  gradeAnswer,
  numberToWords,
  ordinal,
  yearToWords
};
