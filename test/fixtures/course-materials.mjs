// test/fixtures/course-materials.mjs — an invented course's materials, as read documents (lib/docs SourceDoc),
// for the Teaching & Assessment Intelligence tests (test/teaching.test.mjs). Nothing here is a real course.

let n = 0;
const hex = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return (h.toString(16).padStart(8, '0') + ((h ^ 0x5bd1e995) >>> 0).toString(16).padStart(8, '0')).slice(0, 16);
};

/** pages: arrays of [kind, text] (kind: title|heading|paragraph|list|figure|equation|table), one array a page */
export function doc(name, pages, format = 'pdf') {
  const blocks = [];
  pages.forEach((page, i) => {
    page.forEach(([kind, text, level], j) => blocks.push({ id: `p${i + 1}.${j + 1}`, page: i + 1, kind, text, method: 'text', ...(level ? { level } : {}) }));
  });
  n++;
  return { v: 1, id: hex(name + n), name, format, pageCount: pages.length, pages: pages.map((_, i) => ({ n: i + 1, method: 'text', chars: 100, images: 0, ocr: 'none' })), blocks, tables: [], figures: [], checks: [] };
}

export const syllabus = () =>
  doc('ECO304K_Syllabus_Fall2026.pdf', [
    [
      ['title', 'ECO 304K: Introduction to Microeconomics'],
      ['paragraph', 'Instructor: Dr. Jane Smith'],
      ['paragraph', 'Fall 2026 · Office hours: Tuesdays 2–4pm, BRB 3.112'],
      ['heading', 'Course description', 2],
      ['paragraph', 'This course introduces supply and demand, elasticity, consumer surplus, market structures and the welfare effects of policy.'],
      ['heading', 'Grading', 2],
      ['paragraph', 'Midterm 1 (25%), Midterm 2 (25%), Final exam (35%), Homework (15%).'],
      ['paragraph', 'Exams are a mix of multiple-choice and short-answer questions. You will need to draw and interpret graphs on exams. Calculators are allowed on exams.'],
      ['paragraph', 'The final exam is cumulative.'],
    ],
    [
      ['heading', 'Learning outcomes', 2],
      ['list', 'Students will be able to apply supply and demand analysis to real-world markets.'],
      ['heading', 'Attendance', 2],
      ['paragraph', 'Attendance is expected at every lecture; in-class problems are part of participation.'],
      ['heading', 'Academic integrity', 2],
      ['paragraph', 'Academic dishonesty, including copying homework, will be reported. Late work is not accepted.'],
      ['heading', 'Prerequisites', 2],
      ['paragraph', 'None. Required textbook: Principles of Microeconomics.'],
    ],
  ]);

export const slides = () =>
  doc(
    'Lecture 5 - Elasticity.pptx',
    [
      [['title', 'Lecture 5: Elasticity'], ['list', 'Learning objectives: by the end of today you should be able to calculate the price elasticity of demand (PED).'], ['list', 'Explain how elasticity relates to total revenue.']],
      [['title', 'Example: coffee prices'], ['paragraph', 'Suppose the price of coffee rises from $2 to $3 and the quantity demanded falls from 100 to 80 cups a day.'], ['paragraph', 'Quantity demanded falls by 20% while price rises by 50%.']],
      [['title', 'Price elasticity of demand'], ['paragraph', 'Price elasticity of demand (PED) is defined as the percentage change in quantity demanded divided by the percentage change in price.'], ['equation', 'PED = %ΔQ / %ΔP'], ['paragraph', 'For coffee, PED = -20% / 50% = -0.4, so demand for coffee is inelastic.']],
      [['title', 'Example: elastic and inelastic demand'], ['paragraph', 'For example, demand for a particular brand of cereal is elastic because close substitutes exist.'], ['paragraph', 'Demand for insulin is inelastic: there is no substitute, so quantity demanded barely changes.']],
      [['title', 'Recall: movement along versus shift of the demand curve'], ['paragraph', 'Recall from last week that a change in the price of the good causes a movement along the demand curve, rather than a shift of the demand curve.'], ['figure', 'Figure: the demand curve, with a movement along it and a shift of it'], ['paragraph', 'A change in income shifts the demand curve.']],
      [['title', 'Total revenue and elasticity'], ['paragraph', 'Because total revenue equals price times quantity, raising the price raises total revenue when demand is inelastic.'], ['paragraph', 'This is why firms facing inelastic demand raise prices: quantity demanded falls by less than the price rises.']],
      [['title', 'Check your understanding'], ['paragraph', 'Try this: if the price elasticity of demand is -2 and the price rises by 5%, what happens to quantity demanded and to total revenue?']],
      [['title', 'Key takeaways'], ['list', 'Summary: elasticity measures how much quantity demanded responds to price.'], ['list', 'Inelastic demand: total revenue rises with price. Elastic demand: total revenue falls with price.']],
    ],
    'pptx'
  );

export const midterm1 = () =>
  doc('ECO304K_Midterm1_Fall2025.pdf', [
    [
      ['title', 'ECO 304K Midterm 1 — Fall 2025'],
      ['paragraph', 'Name: ______________   Student ID: ________'],
      ['paragraph', 'Time allowed: 75 minutes. Show your work on free-response questions. Calculators are allowed.'],
      ['list', '1. Which of the following would cause a movement along the demand curve for coffee rather than a shift of the demand curve? (2 points)'],
      ['list', 'a) A rise in consumer income'],
      ['list', 'b) A fall in the price of coffee'],
      ['list', 'c) A rise in the price of tea'],
      ['list', 'd) A change in tastes'],
      ['list', '2. If the price elasticity of demand for a good is -0.5, a 10% increase in its price will: (2 points)'],
      ['list', 'a) increase quantity demanded by 5%'],
      ['list', 'b) decrease quantity demanded by 5%'],
      ['list', 'c) decrease quantity demanded by 20%'],
      ['list', 'd) none of the above'],
      ['list', '3. Which of the following is NOT a determinant of demand? (2 points)'],
      ['list', 'a) consumer income'],
      ['list', 'b) the prices of related goods'],
      ['list', 'c) the cost of inputs'],
      ['list', 'd) expectations about future prices'],
    ],
    [
      ['list', '4. Suppose the market for apartments in Austin has demand Qd = 1000 - 2P and supply Qs = 3P - 250. (10 points)'],
      ['list', '(a) Calculate the equilibrium price and quantity.'],
      ['list', '(b) Draw the supply and demand graph and label the equilibrium.'],
      ['list', '(c) Explain what happens to consumer surplus if a price ceiling of $200 is imposed.'],
      ['list', '5. Explain why a firm facing inelastic demand can raise its total revenue by raising its price. Use a graph to support your answer. (6 points)'],
      ['list', '6. Which of the following best explains why the demand for insulin is inelastic? (2 points)'],
      ['list', 'a) Insulin is always expensive'],
      ['list', 'b) There are no close substitutes for insulin'],
      ['list', 'c) Insulin is a luxury good'],
      ['list', 'd) All of the above'],
    ],
  ]);

export const midterm2 = () =>
  doc('ECO304K_Midterm2_Spring2026.pdf', [
    [
      ['title', 'ECO 304K Midterm 2 — Spring 2026'],
      ['paragraph', 'Name: ______________   Time allowed: 75 minutes. Show your work.'],
      ['list', '1. Suppose a tax of $4 per unit is placed on sellers in the market for gasoline. (12 points)'],
      ['list', '(a) Draw a graph showing the effect of the tax on the market and shade the deadweight loss.'],
      ['list', '(b) Calculate the deadweight loss if the quantity falls from 500 to 400 units.'],
      ['list', '(c) Explain who bears more of the tax when demand is inelastic.'],
      ['list', '2. Which of the following is NOT true of a price floor set above the equilibrium price? (2 points)'],
      ['list', 'a) It creates a surplus'],
      ['list', 'b) It raises consumer surplus'],
      ['list', 'c) It can create deadweight loss'],
      ['list', 'd) Quantity sold falls'],
      ['list', '3. Using a supply and demand graph, explain how a subsidy to producers shifts the supply curve and changes consumer surplus and producer surplus. (8 points)'],
    ],
    [
      ['list', '4. The graph shows the market for wheat. If the price elasticity of demand is -1.5 and the price rises from $10 to $12, calculate the percentage change in quantity demanded and explain what happens to total revenue. (6 points)'],
      ['figure', 'Figure 1: the market for wheat, with demand and supply curves'],
      ['list', '5. Which of the following best describes deadweight loss? (2 points)'],
      ['list', 'a) The revenue the government collects from a tax'],
      ['list', 'b) The fall in total surplus that results from a market distortion'],
      ['list', 'c) The loss to producers only'],
      ['list', 'd) Both a and b'],
      ['list', '6. Draw a graph of a market with a price ceiling below equilibrium, label the shortage, and explain the effect on consumer surplus. (8 points)'],
    ],
  ]);

export const quiz = () =>
  doc('Quiz 3 - consumer surplus.pdf', [
    [
      ['title', 'ECO 304K Quiz 3'],
      ['list', '1. Consumer surplus is defined as: (1 point)'],
      ['list', 'a) the price paid minus the cost of production'],
      ['list', 'b) the amount a buyer is willing to pay minus the amount the buyer actually pays'],
      ['list', 'c) total revenue minus total cost'],
      ['list', 'd) none of the above'],
      ['list', '2. If the price of a good falls, consumer surplus will: (1 point)'],
      ['list', 'a) rise'],
      ['list', 'b) fall'],
      ['list', 'c) stay the same'],
      ['list', 'd) it depends on supply'],
      ['list', '3. Which of the following is NOT a reason demand curves slope downward? (1 point)'],
      ['list', 'a) the substitution effect'],
      ['list', 'b) the income effect'],
      ['list', 'c) diminishing marginal utility'],
      ['list', 'd) rising input costs'],
    ],
  ]);

/** A different instructor's section of the same course: same code, different style. */
export const otherSection = () =>
  doc('ECO 304K Practice Exam (Prof. Lee).pdf', [
    [
      ['title', 'ECO 304K Practice Final — Professor Lee'],
      ['paragraph', 'Instructor: Prof. Daniel Lee'],
      ['list', '1. Discuss whether rent control helps the people it is meant to help. Evaluate the arguments on both sides. (20 points)'],
      ['list', '2. Evaluate the claim that a carbon tax is the most efficient way to reduce emissions. (20 points)'],
      ['list', '3. To what extent do minimum wage laws reduce employment? Justify your answer with evidence. (20 points)'],
    ],
  ]);
