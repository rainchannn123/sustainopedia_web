// Redirect mobile-sized viewports to the unsupported page before render.
(function () {
    'use strict';

    var UNSUPPORTED_PATH = '/mobile-unsupported.html';

    // Avoid a redirect loop when already on the unsupported page.
    if (window.location.pathname === UNSUPPORTED_PATH) return;

    // Treat viewports narrower than 1024px as mobile / tablet.
    // matchMedia is synchronous and available on all modern browsers.
    var isMobileViewport = window.matchMedia('(max-width: 1023px)').matches;

    if (isMobileViewport) {
        // Replace the current history entry so Back doesn't loop.
        window.location.replace(UNSUPPORTED_PATH);
    }
}());
