import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import baseApp from './index';
import { registerEconomicsRoutes } from './economics';

type Role='owner'|'admin'|'manager'|'agronomist'|'operator'|'viewer';

const authEnv={
  DATABASE_URL:'postgresql://unused',
  CORS_ORIGIN:'http://localhost:5173',
  APP_ENV:'test',
  NEON_AUTH_BASE_URL:'https://auth.invalid',
  NEON_AUTH_JWKS_URL:'https://auth.invalid/.well-known/jwks.json',
};

describe('authentication boundary',()=>{
  it('mantém health público',async()=>{
    const response=await baseApp.request('/health',{},authEnv as any);
    expect(response.status).toBe(200);
  });

  it('bloqueia API sem Bearer token',async()=>{
    const response=await baseApp.request('/api/v1/me',{},authEnv as any);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:'unauthorized'});
  });

  it('não aceita X-Organization-Id como substituto de autenticação',async()=>{
    const response=await baseApp.request('/api/v1/me',{headers:{'X-Organization-Id':'00000000-0000-0000-0000-000000000001'}},authEnv as any);
    expect(response.status).toBe(401);
  });
});

describe('economics RBAC',()=>{
  function appFor(role:Role){
    const app=new Hono<any>();
    app.use('*',async(c,next)=>{c.set('role',role);c.set('organizationId','00000000-0000-0000-0000-000000000001');c.set('authUserId','user-test');return next();});
    registerEconomicsRoutes(app as never);
    return app;
  }

  it('viewer não lança produção',async()=>{
    const response=await appFor('viewer').request('/api/v1/production',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},{DATABASE_URL:'unused'});
    expect(response.status).toBe(403);
  });

  it('viewer não lança custo',async()=>{
    const response=await appFor('viewer').request('/api/v1/costs',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},{DATABASE_URL:'unused'});
    expect(response.status).toBe(403);
  });

  it('operator pode operar produção mas não pode lançar custo gerencial',async()=>{
    const response=await appFor('operator').request('/api/v1/costs',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},{DATABASE_URL:'unused'});
    expect(response.status).toBe(403);
  });
});
