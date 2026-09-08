export interface Principal {
  id: string;
  kind: "client" | "service";
}

export interface IdentityResolver {
  resolve(request: Request): Promise<Principal>;
}

export class LocalIdentityResolver implements IdentityResolver {
  constructor(private readonly clientId: string) {}

  async resolve(request: Request): Promise<Principal> {
    return { id: request.headers.get("x-client-id") ?? this.clientId, kind: "client" };
  }
}
