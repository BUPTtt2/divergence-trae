function fieldId(question, index) {
  return String(question?.fieldId || question?.taskId || question?.id || `question_${index + 1}`).trim();
}

function clean(value) {
  return String(value || '').trim().slice(0, 1000);
}

function serializedValue(value) {
  const text = clean(value);
  return /^(暂不回答|不知道|不愿回答)$/.test(text) ? '用户选择跳过本项澄清' : text;
}

export function createClarificationDraft(questions = []) {
  return Object.fromEntries((Array.isArray(questions) ? questions : []).map((question, index) => [fieldId(question, index), '']));
}

export function clarificationDraftComplete(draft = {}, questions = []) {
  return (Array.isArray(questions) ? questions : []).every((question, index) => (
    question?.required === false || clean(draft[fieldId(question, index)]).length > 0
  ));
}

export function serializeClarificationAnswers(draft = {}, questions = []) {
  return (Array.isArray(questions) ? questions : []).flatMap((question, index) => {
    const id = fieldId(question, index);
    const answer = serializedValue(draft[id]);
    if (!answer) return [];
    return [{
      fieldId: id,
      question: String(question?.question || question?.prompt || question || '').trim(),
      answer,
    }];
  });
}

export default { clarificationDraftComplete, createClarificationDraft, serializeClarificationAnswers };
