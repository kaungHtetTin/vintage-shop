import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { Head, useForm, usePage } from "@/spa/router";
import { useEffect, useState } from "react";
import { routeWithBase } from "@/Utils/url";
import { usePhraseTranslation } from "@/Utils/i18n";
import Icon from "@/Components/Admin/icons";

export default function Login({ status, error }) {
    const uiText = useUiTranslation();
    const { app_base, app_settings } = usePage().props;
    const t = usePhraseTranslation();
    const [showPassword, setShowPassword] = useState(false);
    const { data, setData, post, processing, errors, reset } = useForm({
        email: "",
        password: "",
        remember: false,
    });
    const appName =
        !app_settings?.app_name || app_settings.app_name === "LaLaPick"
            ? "Vintage Shop"
            : app_settings.app_name;
    useEffect(() => () => reset("password"), []);
    const submit = (event) => {
        event.preventDefault();
        post(routeWithBase("/admin/login", app_base));
    };
    return (
        <div
            className="app-root vintage-admin v-login-page"
            data-theme="light"
            style={{ "--color-primary": "#a45138" }}
        >
            <Head title={`${t("Staff login")} | ${appName}`} />
            <section className="v-login-story">
                <div className="v-login-brand">
                    <span>
                        {app_settings?.logo_url ? (
                            <img src={app_settings.logo_url} alt="" />
                        ) : (
                            <Icon name="shop" size={24} />
                        )}
                    </span>
                    <strong>{appName}</strong>
                </div>
                <div className="v-login-editorial">
                    <span className="v-kicker">
                        {t("THE SHOPKEEPER’S DESK")}
                    </span>
                    <h1>
                        {t("A place for")}
                        <br />
                        <em>{t("timeless things.")}</em>
                    </h1>
                    <p>
                        {t(
                            "Every piece has a past. Every day brings a new story. Take care of your collection, your customers, and everything in between.",
                        )}
                    </p>
                    <div className="v-login-seal" aria-hidden="true">
                        <Icon name="tag" size={34} />
                        <span> {uiText("VINTAGE")} <br /> {uiText("& FOUND")} </span>
                    </div>
                </div>
                <div className="v-login-story-footer">
                    <span>
                        {t("Thoughtfully collected. Carefully managed.")}
                    </span>
                    <span aria-hidden="true">&#10035;</span>
                </div>
            </section>
            <section className="v-login-form-side">
                <div className="v-login-form-wrap">
                    <p className="v-kicker">
                        <span />
                        {t("STAFF ACCESS")}
                    </p>
                    <h2>
                        {t("Welcome back.")}
                        <span />
                    </h2>
                    <p className="v-login-intro">
                        {t(
                            "Sign in with your staff account to open the shop. All the little details, in one place.",
                        )}
                    </p>
                    {status && (
                        <div className="v-login-message" role="status">
                            {t(status)}
                        </div>
                    )}
                    {error && (
                        <div className="v-login-message is-error" role="alert">
                            {uiText(error)}
                        </div>
                    )}
                    <form onSubmit={submit}>
                        <label className="v-login-field">
                            <span>{t("Email or phone")}</span>
                            <input
                                name="email"
                                type="text"
                                autoComplete="username"
                                autoFocus
                                required
                                value={data.email}
                                onChange={(event) =>
                                    setData("email", event.target.value)
                                }
                                placeholder={t("Your staff email or phone")}
                                aria-invalid={Boolean(errors.email)}
                                aria-describedby={
                                    errors.email
                                        ? "login-email-error"
                                        : undefined
                                }
                            />
                            {errors.email && (
                                <small id="login-email-error" role="alert">
                                    {errors.email}
                                </small>
                            )}
                        </label>
                        <label className="v-login-field">
                            <span>{t("Password")}</span>
                            <div className="v-login-password">
                                <input
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    required
                                    value={data.password}
                                    onChange={(event) =>
                                        setData("password", event.target.value)
                                    }
                                    placeholder={t("Enter your password")}
                                    aria-invalid={Boolean(errors.password)}
                                    aria-describedby={
                                        errors.password
                                            ? "login-password-error"
                                            : undefined
                                    }
                                />
                                <button
                                    type="button"
                                    aria-label={t(
                                        showPassword
                                            ? "Hide password"
                                            : "Show password",
                                    )}
                                    aria-pressed={showPassword}
                                    onClick={() =>
                                        setShowPassword((shown) => !shown)
                                    }
                                >
                                    <Icon name="eye" size={18} />
                                </button>
                            </div>
                            {errors.password && (
                                <small id="login-password-error" role="alert">
                                    {errors.password}
                                </small>
                            )}
                        </label>
                        <label className="v-login-remember">
                            <input
                                type="checkbox"
                                name="remember"
                                checked={data.remember}
                                onChange={(event) =>
                                    setData("remember", event.target.checked)
                                }
                            />
                            <span>{t("Remember me on this device")}</span>
                        </label>
                        <button
                            className="v-login-submit"
                            type="submit"
                            disabled={processing}
                        >
                            {t(
                                processing
                                    ? "Opening the shop..."
                                    : "Enter the workspace",
                            )}
                            <span aria-hidden="true">&#8599;</span>
                        </button>
                    </form>
                    <p className="v-login-private">
                        <Icon name="lock" size={13} />
                        {t("A private workspace for authorised staff.")}
                    </p>
                </div>
                <span className="v-login-bottom">
                    {appName} <span aria-hidden="true">/</span>{" "}
                    {t("A new chapter for old favourites.")}
                </span>
            </section>
        </div>
    );
}
