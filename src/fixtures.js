export const oldContext = {
  id: 'returns-v1',
  title: 'Returns policy · version 1',
  text: 'Customers may return eligible products within 30 days of delivery for a full refund. Items must be unused and include the original receipt.'
};

export const newContext = {
  id: 'returns-v2',
  title: 'Returns policy · version 2',
  text: 'Customers may return eligible products within 14 days of delivery for a full refund. Items must be unused and include the original receipt.'
};

export const tests = [
  {
    id: 'T-101', name: 'Return window answer',
    question: 'How many days after delivery can I return an eligible item?',
    expected: '30 days', dependencyIds: ['returns-policy'],
    intent: 'customer returns eligibility deadline after delivery and refund window',
    assertion: { kind: 'days', value: 30 }
  },
  {
    id: 'T-102', name: 'Day 20 eligibility',
    question: 'Can I return an unused item 20 days after delivery?',
    expected: 'Yes', dependencyIds: ['returns-policy'],
    intent: 'whether an item delivered twenty days ago is eligible for return',
    assertion: { kind: 'eligibleOnDay', value: 20 }
  },
  {
    id: 'T-103', name: 'Refund FAQ wording',
    question: 'What is the deadline for a full refund?',
    expected: '30 days', dependencyIds: [],
    intent: 'refund time limit for eligible products sent back after purchase',
    assertion: { kind: 'days', value: 30 }
  },
  {
    id: 'T-104', name: 'Receipt requirement',
    question: 'Do I need the original receipt to return an item?',
    expected: 'Yes', dependencyIds: ['returns-policy'],
    intent: 'original receipt required for returns',
    assertion: { kind: 'receipt', value: true }
  },
  {
    id: 'T-105', name: 'Shipping ETA',
    question: 'When will my order ship?',
    expected: '2 business days', dependencyIds: ['shipping-policy'],
    intent: 'order shipping fulfillment time and delivery ETA',
    assertion: { kind: 'unrelated', value: '2 business days' }
  }
];

// These are stable fixture distances for the offline demo only. Appwrite mode queries
// VectorsDB and uses its real cosine distances instead.
export const demoSemanticMatches = [
  { id: 'T-103', distance: 0.18 },
  { id: 'T-101', distance: 0.24 },
  { id: 'T-102', distance: 0.29 },
  { id: 'T-104', distance: 0.44 },
  { id: 'T-105', distance: 0.83 }
];
