import type { CefrLevel } from "./build.js";

// 模板加速器（product_spec §6.2）：预设模板是**可选**起点，不是必经入口——
// 创作者可以从空白粘贴/上传开始，也可以一键预填向导再改。模板只预填
// 摄入文本与建议值，不携带教学策略（训练模式、评分规则属于 manifest，
// 由向导/专家模式单独处理）；模板文本沿用摄入行协议（一行一课）。

export interface StudioTemplate {
  template_id: string;
  /** 创作者可见名称。 */
  title: string;
  description: string;
  cefr_suggestion: CefrLevel;
  title_suggestion: string;
  /** 预填文本：一行一课（Szenario/Valenz/Konstruktion: 标题 | 例句 [| 词元]）。 */
  prefilled_text: string;
}

export const STUDIO_TEMPLATES: readonly StudioTemplate[] = [
  {
    template_id: "tpl.scenario-dialogue",
    title: "情景对话",
    description: "咖啡馆、问路、预约等日常情景，适合从零组织一门 A2 口语课。",
    cefr_suggestion: "A2",
    title_suggestion: "Alltagssituationen auf Deutsch",
    prefilled_text: [
      "Szenario: Im Café bestellen | Ich hätte gern einen Kaffee, bitte.",
      "Szenario: Nach dem Weg fragen | Entschuldigung, wie komme ich zum Bahnhof?",
      "Szenario: Einen Termin vereinbaren | Ich möchte gern einen Termin machen.",
    ].join("\n"),
  },
  {
    template_id: "tpl.verb-valence",
    title: "动词配价",
    description: "围绕德语动词配价（及物/双宾/介词补足）组织操练单元。",
    cefr_suggestion: "B1",
    title_suggestion: "Deutsche Verbvalenz üben",
    prefilled_text: [
      "Valenz: empfehlen | Der Kellner empfiehlt uns den Kuchen. | empfehlen",
      "Valenz: schenken | Die Großmutter schenkt dem Kind ein Buch. | schenken",
      "Valenz: erklären | Der Lehrer erklärt den Schülern die Regel. | erklären",
    ].join("\n"),
  },
  {
    template_id: "tpl.polite-construction",
    title: "礼貌构式",
    description: "虚拟式请求、婉转追问等礼貌表达的构式训练。",
    cefr_suggestion: "A2",
    title_suggestion: "Höflich auf Deutsch",
    prefilled_text: [
      "Konstruktion: Höfliche Bitte | Könnten Sie bitte das Wasser bringen?",
      "Konstruktion: Höfliche Nachfrage | Könnten Sie das bitte wiederholen?",
      "Konstruktion: Wunsch äußern | Ich würde gern ein Einzelzimmer nehmen.",
    ].join("\n"),
  },
];

export function templateById(templateId: string): StudioTemplate | undefined {
  return STUDIO_TEMPLATES.find((t) => t.template_id === templateId);
}
