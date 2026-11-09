/** App-wide switches set in code, so an app can turn a whole feature off for everyone without
    deleting it. `notifications`: the bell, the Notifications page and its links. On in the
    template; set it to false to hide them (the server keeps recording notifications, so turning
    it back on shows the history). */
export const appFeatures = { notifications: true } as const;
