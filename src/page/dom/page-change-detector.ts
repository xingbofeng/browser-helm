export type PageChangeSnapshot = {
  url: string;
  origin: string;
  title: string;
  frameUrl?: string | undefined;
  frameReachable?: boolean | undefined;
};

export type PageChangeDetectionInput = {
  previous: PageChangeSnapshot;
  current: PageChangeSnapshot;
};

export type PageChangeDetection = {
  changedPage: boolean;
  requiresObserve: boolean;
  reason: string;
};

export function detectPageChange(
  input: PageChangeDetectionInput
): PageChangeDetection {
  if (input.previous.origin !== input.current.origin) {
    return changed('Page origin changed');
  }
  if (input.previous.url !== input.current.url) {
    return changed('Page URL changed');
  }
  if (input.previous.title !== input.current.title) {
    return changed('Page title changed');
  }
  if (
    input.previous.frameUrl !== undefined &&
    input.current.frameUrl !== undefined &&
    input.previous.frameUrl !== input.current.frameUrl
  ) {
    return changed('Frame URL changed');
  }
  if (
    input.previous.frameReachable === true &&
    input.current.frameReachable === false
  ) {
    return changed('Frame is no longer reachable');
  }

  return {
    changedPage: false,
    requiresObserve: false,
    reason: 'Page metadata unchanged'
  };
}

function changed(reason: string): PageChangeDetection {
  return {
    changedPage: true,
    requiresObserve: true,
    reason
  };
}
