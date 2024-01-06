
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
