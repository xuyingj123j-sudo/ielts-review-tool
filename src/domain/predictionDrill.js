'use strict';

const ANSWER_TYPES = Object.freeze([
  'NUMBER', 'NOUN', 'VERB', 'ADJECTIVE', 'DATE', 'TIME', 'PLACE', 'NAME', 'OTHER'
]);

const PREDICTION_TEMPLATES = Object.freeze([
  { sentence: 'The total cost is £{V}.', answerType: 'NUMBER', fillers: ['45', '120', '89.50'] },
  { sentence: 'The maximum group size is {V}.', answerType: 'NUMBER', fillers: ['12', '24', '35'] },
  { sentence: 'Please bring a valid {V}.', answerType: 'NOUN', fillers: ['passport', 'membership card', 'student ID'] },
  { sentence: 'The centre has recently installed a new {V}.', answerType: 'NOUN', fillers: ['printer', 'lift', 'projector'] },
  { sentence: 'Applicants must {V} before the deadline.', answerType: 'VERB', fillers: ['submit their forms', 'pay the deposit', 'attend an interview'] },
  { sentence: 'Visitors should {V} at reception.', answerType: 'VERB', fillers: ['sign in', 'collect a pass', 'leave their bags'] },
  { sentence: 'The new library is extremely {V}.', answerType: 'ADJECTIVE', fillers: ['spacious', 'convenient', 'crowded'] },
  { sentence: 'The coastal route is particularly {V}.', answerType: 'ADJECTIVE', fillers: ['scenic', 'steep', 'popular'] },
  { sentence: 'The workshop starts on {V}.', answerType: 'DATE', fillers: ['the third of May', 'the twelfth of June', 'the twenty-first of August'] },
  { sentence: 'The appointment has been moved to {V}.', answerType: 'DATE', fillers: ['the ninth of April', 'the seventeenth of July', 'the second of October'] },
  { sentence: 'Registration closes at {V}.', answerType: 'TIME', fillers: ['half past nine', 'a quarter to five', 'twenty past eleven'] },
  { sentence: 'The first guided tour leaves at {V}.', answerType: 'TIME', fillers: ['eight o’clock', 'a quarter past ten', 'ten to two'] },
  { sentence: 'The meeting will be held near the {V}.', answerType: 'PLACE', fillers: ['car park', 'main entrance', 'library'] },
  { sentence: 'You can collect the tickets from the {V}.', answerType: 'PLACE', fillers: ['information desk', 'town hall', 'visitor centre'] },
  { sentence: 'You can contact {V} for more details.', answerType: 'NAME', fillers: ['Mr Harrison', 'Dr Patel', 'Ms Coleman'] },
  { sentence: 'The booking was made under the name {V}.', answerType: 'NAME', fillers: ['Daniel Cooper', 'Sarah Bennett', 'Helen Morris'] },
  { sentence: 'Your access code is {V}.', answerType: 'OTHER', fillers: ['BK-204', 'RX-71', 'LM-508'] },
  { sentence: 'The website address ends with {V}.', answerType: 'OTHER', fillers: ['dot org', 'dot net', 'dot co dot uk'] }
].map((template) => Object.freeze({ ...template, fillers: Object.freeze([...template.fillers]) })));

function pick(values, random) {
  return values[Math.floor(random() * values.length)];
}

function generatePredictionQuestion({ random = Math.random } = {}) {
  if (typeof random !== 'function') throw new TypeError('random 必须是函数');
  const template = pick(PREDICTION_TEMPLATES, random);
  const correctAnswer = pick(template.fillers, random);
  return {
    sentenceTemplate: template.sentence,
    sentenceWithBlank: template.sentence.replaceAll('{V}', '______'),
    answerType: template.answerType,
    correctAnswer,
    spokenText: template.sentence.replaceAll('{V}', correctAnswer)
  };
}

module.exports = { ANSWER_TYPES, PREDICTION_TEMPLATES, generatePredictionQuestion };
