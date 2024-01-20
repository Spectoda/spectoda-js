
// TODO make this functions work in this new index.ts file

hideHomeButton() {
    logging.debug("> Hiding home button...");

    if (!detectSpectodaConnect()) {
        return Promise.reject("PlatformNotSupported");
    }

    return window.flutter_inappwebview.callHandler("hideHomeButton");
}

// option:
//  0 = no restriction, 1 = portrait, 2 = landscape
setOrientation(option) {
    logging.debug("> Setting orientation...");

    if (!detectSpectodaConnect()) {
        return Promise.reject("PlatformNotSupported");
    }

    if (typeof option !== "number") {
        return Promise.reject("InvalidOption");
    }

    if (option < 0 || option > 2) {
        return Promise.reject("InvalidOption");
    }

    return window.flutter_inappwebview.callHandler("setOrientation", option);
}

// open external links in Flutter SC. For more informations ask LukyKovy
if (detectSpectodaConnect()) {
    // target="_blank" global handler
    // @ts-ignore

    /** @type {HTMLBodyElement} */ document.querySelector("body").addEventListener("click", function (e) {
    e.preventDefault();

    (function (e, d, w) {
        if (!e.composedPath) {
            e.composedPath = function () {
                if (this.path) {
                    return this.path;
                }
                var target = this.target;

                this.path = [];
                while (target.parentNode !== null) {
                    this.path.push(target);
                    target = target.parentNode;
                }
                this.path.push(d, w);
                return this.path;
            };
        }
    })(Event.prototype, document, window);
    // @ts-ignore
    const path = e.path || (e.composedPath && e.composedPath());

    // @ts-ignore
    for (let el of path) {
        if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
            e.preventDefault();
            const url = el.getAttribute("href");
            logging.verbose(url);
            // @ts-ignore
            logging.debug("Openning external url", url);
            window.flutter_inappwebview.callHandler("openExternalUrl", url);
            break;
        }
    }
});
}