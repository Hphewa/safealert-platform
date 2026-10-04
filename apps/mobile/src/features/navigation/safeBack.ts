type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: string) => void;
};

/** Navigate back when history exists, otherwise use the screen's safe entry route. */
export function goBackSafely(router: BackRouter, fallback = '/') {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallback);
}
