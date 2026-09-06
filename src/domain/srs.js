'use strict';

const BOX_INTERVALS = Object.freeze({ 1: 1, 2: 2, 3: 4, 4: 7, 5: 15 });

function toLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function nextReview(box, from = new Date()) {
  if (!Number.isInteger(box) || box < 1 || box > 5) {
    throw new RangeError('箱位必须是 1-5 的整数');
  }
  return toLocalDate(addDays(from, BOX_INTERVALS[box]));
}

function transition(boxBefore, result, reviewedAt = new Date()) {
  if (!Number.isInteger(boxBefore) || boxBefore < 1 || boxBefore > 5) {
    throw new RangeError('当前箱位必须是 1-5 的整数');
  }
  if (!['correct', 'incorrect'].includes(result)) {
    throw new TypeError('复习结果必须是 correct 或 incorrect');
  }
  const boxAfter = result === 'correct' ? Math.min(5, boxBefore + 1) : 1;
  return {
    boxBefore,
    boxAfter,
    nextReviewDate: nextReview(boxAfter, reviewedAt)
  };
}

module.exports = { BOX_INTERVALS, addDays, nextReview, toLocalDate, transition };

