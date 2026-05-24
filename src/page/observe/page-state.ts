import { findInteractiveCandidates } from '../a11y/element-finder';

export type PageState = {
  interactiveCount: number;
  pageStateSummary: string;
  emptyReason?: string;
};

export function readPageState(document: Document): PageState {
  const interactiveCount = findInteractiveCandidates(document).length;
  if (interactiveCount === 0) {
    return {
      interactiveCount,
      pageStateSummary: '页面没有识别到可交互元素',
      emptyReason: 'NO_INTERACTIVE_ELEMENTS'
    };
  }

  return {
    interactiveCount,
    pageStateSummary: `页面包含 ${interactiveCount} 个可交互元素`
  };
}
