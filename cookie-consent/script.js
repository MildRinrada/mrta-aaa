/*!
 * Dependency-free replacement for whitecube/laravel-cookie-consent dist/cookies.js,
 * served by App\Http\Middleware\CookieConsentScriptController instead of the
 * vendor bundle (see that controller for why). The config object passed to the
 * constructor at the bottom of this file is a placeholder ("config" colon 1,
 * spelled out here so this comment survives the replacement) - the controller
 * str_replace()s it with the JSON route map at response time.
 */
(function () {
    'use strict';

    class LaravelCookieConsent {
        constructor(config) {
            this.config = config;
        }

        acceptAll() {
            return this.request(this.config['accept.all'])
                .then((response) => this.addScripts(response.data));
        }

        acceptEssentials() {
            return this.request(this.config['accept.essentials'])
                .then((response) => this.addScripts(response.data));
        }

        configure(data) {
            return this.request(this.config['accept.configuration'], data)
                .then((response) => this.addScripts(response.data));
        }

        reset() {
            return this.request(this.config['reset'])
                .then((response) => this.addNotice(response.data));
        }

        request(url, data = null) {
            // The consent routes run in the "web" middleware group, so CSRF
            // protection applies. The XSRF-TOKEN cookie is HttpOnly in this
            // app, so the token comes embedded in the config (_csrf) instead;
            // the cookie read stays as a fallback in case that ever changes.
            const headers = {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            };

            if (this.config._csrf) {
                headers['X-CSRF-TOKEN'] = this.config._csrf;
            } else {
                const token = this.readCookie('XSRF-TOKEN');
                if (token) {
                    headers['X-XSRF-TOKEN'] = token;
                }
            }

            return fetch(url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: headers,
                body: data,
            }).then((response) => {
                if (!response.ok) {
                    throw new Error('Cookie consent request failed with status ' + response.status);
                }
                // Wrap as { data } to keep the response shape the rest of
                // this class expects.
                return response.json().then((json) => ({ data: json }));
            });
        }

        readCookie(name) {
            const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
            return match ? decodeURIComponent(match[1]) : null;
        }

        addScripts(data) {
            if (!data.scripts) {
                return;
            }

            data.scripts.forEach((script) => {
                const scriptRegex = /<script[^]*<\/script>/;
                if (!scriptRegex.test(script)) {
                    console.error('Invalid script tag: ' + script);
                }
                let tmp = document.createElement('div');
                tmp.innerHTML = script;

                let tag = document.createElement('script');
                tag.textContent = tmp.querySelector('script').textContent;
                for (const attr of tmp.querySelector('script').attributes) {
                    tag.setAttribute(attr.name, attr.value);
                }
                tag.setAttribute('data-cookie-consent', true);

                document.head.appendChild(tag);
            });
        }

        addNotice(data) {
            if (!data.notice) {
                return;
            }

            let tmp = document.createElement('div');
            tmp.innerHTML = data.notice;

            let cookies = tmp.querySelector('#cookies-policy');
            document.body.appendChild(cookies);

            let tags = tmp.querySelectorAll('[data-cookie-consent]');

            if (!tags.length) {
                return;
            }

            tags.forEach((tag) => {
                if (tag.nodeName === 'SCRIPT') {
                    const script = document.createElement('script');
                    script.textContent = tag.textContent;
                    document.body.appendChild(script);
                } else {
                    document.body.appendChild(tag);
                }
            });
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        window.LaravelCookieConsent = new LaravelCookieConsent({"accept.all":"\/cookie-consent\/accept-all","accept.essentials":"\/cookie-consent\/accept-essentials","accept.configuration":"\/cookie-consent\/configure","reset":"\/cookie-consent\/reset","_csrf":"wEBJJKCqY23snmjJxKHfbaUA2SRozAO4vxKQfk2N"});
    });
})();
