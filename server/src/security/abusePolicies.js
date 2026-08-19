import { distributedRateLimit } from '../middleware/distributedRateLimit.js';
import { recordSecurityTelemetry } from '../services/securityTelemetryService.js';

const email = (req) => String(req.body?.email || 'missing-email').trim().toLowerCase();
const ip = (req) => req.ip || req.socket?.remoteAddress || 'unknown-ip';
const principal = (req) => req.principal?.userId || req.userId || ip(req);
const token = (req) => String(req.body?.token || 'missing-token');
const refreshToken = (req) => String(req.body?.refreshToken || 'missing-refresh-token');

const POLICIES = Object.freeze({
  passwordResetRequest: [
    { scope: 'password_reset_email_cooldown', subject: email, limit: 1, windowSeconds: 60 },
    { scope: 'password_reset_email_hour', subject: email, limit: 3, windowSeconds: 3600 },
    { scope: 'password_reset_email_day', subject: email, limit: 5, windowSeconds: 86400 },
    { scope: 'password_reset_ip_hour', subject: ip, limit: 10, windowSeconds: 3600 },
    { scope: 'password_reset_ip_day', subject: ip, limit: 30, windowSeconds: 86400 },
  ],
  emailVerificationRequest: [
    { scope: 'email_verification_user_cooldown', subject: principal, limit: 1, windowSeconds: 60 },
    { scope: 'email_verification_user_hour', subject: principal, limit: 3, windowSeconds: 3600 },
    { scope: 'email_verification_user_day', subject: principal, limit: 5, windowSeconds: 86400 },
    { scope: 'email_verification_ip_hour', subject: ip, limit: 10, windowSeconds: 3600 },
  ],
  accountTokenConsume: [
    { scope: 'account_token_consume_token_hour', subject: token, limit: 5, windowSeconds: 3600 },
    { scope: 'account_token_consume_ip_hour', subject: ip, limit: 20, windowSeconds: 3600 },
  ],
  passwordChange: [
    { scope: 'password_change_user_hour', subject: principal, limit: 5, windowSeconds: 3600 },
    { scope: 'password_change_ip_hour', subject: ip, limit: 20, windowSeconds: 3600 },
  ],
  accountExport: [
    { scope: 'account_export_user_day', subject: principal, limit: 3, windowSeconds: 86400 },
    { scope: 'account_export_ip_day', subject: ip, limit: 10, windowSeconds: 86400 },
  ],
  login: [
    { scope: 'login_email_15m', subject: email, limit: 10, windowSeconds: 900 },
    { scope: 'login_ip_15m', subject: ip, limit: 60, windowSeconds: 900 },
  ],
  register: [
    { scope: 'register_email_day', subject: email, limit: 3, windowSeconds: 86400 },
    { scope: 'register_ip_hour', subject: ip, limit: 20, windowSeconds: 3600 },
  ],
  anonymousIdentity: [
    { scope: 'anonymous_identity_ip_day', subject: ip, limit: 120, windowSeconds: 86400 },
  ],
  refresh: [
    { scope: 'refresh_token_hour', subject: refreshToken, limit: 10, windowSeconds: 3600 },
    { scope: 'refresh_ip_hour', subject: ip, limit: 120, windowSeconds: 3600 },
  ],
  deliberationRoute: [
    { scope: 'deliberation_route_user_hour', subject: principal, limit: 30, windowSeconds: 3600 },
  ],
  deliberationStart: [
    { scope: 'deliberation_start_user_hour', subject: principal, limit: 6, windowSeconds: 3600 },
  ],
  deliberationPlan: [
    { scope: 'deliberation_plan_user_hour', subject: principal, limit: 12, windowSeconds: 3600 },
  ],
  deliberationExecute: [
    { scope: 'deliberation_execute_user_hour', subject: principal, limit: 8, windowSeconds: 3600 },
  ],
  deliberationCommit: [
    { scope: 'deliberation_commit_user_hour', subject: principal, limit: 12, windowSeconds: 3600 },
  ],
  destinyArtwork: [
    { scope: 'destiny_artwork_user_hour', subject: principal, limit: 4, windowSeconds: 3600 },
  ],
  communityPost: [
    { scope: 'community_post_user_day', subject: principal, limit: 10, windowSeconds: 86400 },
  ],
  communityReply: [
    { scope: 'community_reply_user_hour', subject: principal, limit: 20, windowSeconds: 3600 },
  ],
  communityLike: [
    { scope: 'community_like_user_hour', subject: principal, limit: 60, windowSeconds: 3600 },
  ],
  communityReport: [
    { scope: 'community_report_user_day', subject: principal, limit: 10, windowSeconds: 86400 },
    { scope: 'community_report_ip_day', subject: ip, limit: 20, windowSeconds: 86400 },
  ],
});

function policy(name) {
  const definitions = POLICIES[name];
  if (!definitions) throw new Error(`Unknown abuse policy: ${name}`);
  return definitions;
}

export function resolvePolicyChecks(name, req) {
  return policy(name).map((definition) => ({
    ...definition,
    subject: String(definition.subject(req) || 'unknown'),
  }));
}

export function policyMiddlewares(name) {
  return policy(name).map((definition) => distributedRateLimit({
    ...definition,
    onDenied: (req, details) => recordSecurityTelemetry({
      event: 'security_rate_limited',
      principalId: req.principal?.userId || req.userId || 'security-public',
      properties: details,
    }),
  }));
}

export default policyMiddlewares;
