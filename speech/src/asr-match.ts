const PUNCTUATION = /[.,!?;:"'`´()<>[\]{}…«»„“”\-–—]/g;

export function normalizeGermanText(text: string): string {
  return text
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ContentMatch {
  completeness: number;
  insertions: number;
  deletions: number;
  substitutions: number;
}

export function matchContent(referenceText: string, hypothesisText: string): ContentMatch {
  const ref = normalizeGermanText(referenceText).split(" ").filter(Boolean);
  const hyp = normalizeGermanText(hypothesisText).split(" ").filter(Boolean);
  if (ref.length === 0) {
    return { completeness: 0, insertions: hyp.length, deletions: 0, substitutions: 0 };
  }

  const rows = ref.length + 1;
  const cols = hyp.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  let substitutions = 0;
  let insertions = 0;
  let deletions = 0;
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      if (ref[i - 1] !== hyp[j - 1]) substitutions += 1;
      i -= 1;
      j -= 1;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      insertions += 1;
      j -= 1;
    } else {
      deletions += 1;
      i -= 1;
    }
  }

  const matched = ref.length - substitutions - deletions;
  const completeness = Math.max(0, matched / ref.length);

  return {
    completeness: Math.round(completeness * 1000) / 1000,
    insertions,
    deletions,
    substitutions,
  };
}
