'use strict';

function normalizeAnswer(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en-GB');
}

function acceptedAnswers(answerText) {
  return String(answerText ?? '').split('/').map((answer) => answer.trim()).filter(Boolean);
}

function answerMatches(submittedAnswer, answerText) {
  const normalized = normalizeAnswer(submittedAnswer);
  return acceptedAnswers(answerText).some((answer) => normalizeAnswer(answer) === normalized);
}

module.exports = { acceptedAnswers, answerMatches, normalizeAnswer };
