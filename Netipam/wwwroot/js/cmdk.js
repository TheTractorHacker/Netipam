// Ctrl/Cmd+K opens the command palette (calls back into MainLayout).
window.netipamCmdk = {
    register: function (dotnetRef) {
        if (window.__netipamCmdkHandler) {
            document.removeEventListener('keydown', window.__netipamCmdkHandler);
        }
        window.__netipamCmdkHandler = function (e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                dotnetRef.invokeMethodAsync('OpenCommandPalette');
            }
        };
        document.addEventListener('keydown', window.__netipamCmdkHandler);
    },
    unregister: function () {
        if (window.__netipamCmdkHandler) {
            document.removeEventListener('keydown', window.__netipamCmdkHandler);
            window.__netipamCmdkHandler = null;
        }
    }
};
