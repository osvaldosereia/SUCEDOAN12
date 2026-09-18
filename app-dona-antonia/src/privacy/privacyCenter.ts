export type PrivacyRequestType =
  | 'access'
  | 'correction'
  | 'deletion'
  | 'revoke_device';

export interface PrivacyGatewayResult {
  requestId: string;
  environment: 'homologation';
}

export interface PrivacyGateway {
  submit(type: PrivacyRequestType): Promise<PrivacyGatewayResult>;
}

export function createPrivacyCenter(
  options: { gateway?: PrivacyGateway } = {},
) {
  return {
    async request(type: PrivacyRequestType) {
      if (!options.gateway) {
        return {
          submitted: false as const,
          reason: 'backend_unavailable' as const,
        };
      }

      const result = await options.gateway.submit(type);
      if (!result.requestId.startsWith('TEST-PRIVACY-')) {
        throw new Error('HML privacy gateway must return TEST-PRIVACY-* request id');
      }

      return {
        submitted: true as const,
        reason: 'homologation' as const,
        requestId: result.requestId,
      };
    },
  };
}
