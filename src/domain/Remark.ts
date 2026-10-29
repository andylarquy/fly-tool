export type RemarkKind =
  | "welcome_back"
  | "you_again"
  | "previous_firm_landing"
  | "smooth_landing"
  | "firm_landing";

export interface Remark {
  kind: RemarkKind;
}
