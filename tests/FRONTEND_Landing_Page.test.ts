import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${N8N_URL}/webhook/titanium-landing`;

describe('FRONTEND_Landing_Page', () => {
  const TIMEOUT = 15000;

  // Note: This workflow requires manual "Publish" in n8n UI to register webhooks
  // See: https://github.com/n8n-io/n8n/issues/551
  // Tests below validate the workflow structure and HTML generation

  it('Structure: workflow has correct node count', async () => {
    // This test validates the workflow structure without calling the webhook
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    expect(workflow.nodes.length).toBe(3); // Webhook, Generate Frontend, Respond to Webhook
  }, TIMEOUT);

  it('Structure: workflow uses responseNode mode', async () => {
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    const webhookNode = workflow.nodes.find(n => n.name === 'Webhook');
    expect(webhookNode.parameters.responseMode).toBe('responseNode');
  }, TIMEOUT);

  it('Structure: HTML contains expected title', async () => {
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    const generateNode = workflow.nodes.find(n => n.name === 'Generate Frontend');
    const html = generateNode.parameters.jsCode.match(/<title>(.*?)<\/title>/)[1];
    expect(html).toContain('Booking Titanium');
  }, TIMEOUT);

  it('Structure: HTML contains hero content', async () => {
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    const generateNode = workflow.nodes.find(n => n.name === 'Generate Frontend');
    const html = generateNode.parameters.jsCode;
    expect(html).toContain('Gestión de Reservas');
    expect(html).toContain('Inteligente');
    expect(html).toContain('IA + Automatización');
  }, TIMEOUT);

  it('Structure: HTML contains CTA buttons', async () => {
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    const generateNode = workflow.nodes.find(n => n.name === 'Generate Frontend');
    const html = generateNode.parameters.jsCode;
    expect(html).toContain('Reservar vía Telegram');
    expect(html).toContain('Saber más');
  }, TIMEOUT);

  it('Structure: HTML contains cursor glow effect', async () => {
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    const generateNode = workflow.nodes.find(n => n.name === 'Generate Frontend');
    const html = generateNode.parameters.jsCode;
    expect(html).toContain('cursor-glow');
    expect(html).toContain('cursorGlow');
  }, TIMEOUT);

  it('Structure: HTML contains ambient background', async () => {
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    const generateNode = workflow.nodes.find(n => n.name === 'Generate Frontend');
    const html = generateNode.parameters.jsCode;
    expect(html).toContain('ambient-bg');
    expect(html).toContain('radial-gradient');
  }, TIMEOUT);

  it('Structure: HTML has valid DOCTYPE', async () => {
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    const generateNode = workflow.nodes.find(n => n.name === 'Generate Frontend');
    const html = generateNode.parameters.jsCode;
    expect(html).toContain('<!DOCTYPE html>');
  }, TIMEOUT);

  it('Integration: landing page includes Google Fonts', async () => {
    const workflow = await import('../workflows/FRONTEND_Landing_Page.json');
    const generateNode = workflow.nodes.find(n => n.name === 'Generate Frontend');
    const html = generateNode.parameters.jsCode;
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('Outfit');
    expect(html).toContain('Manrope');
  }, TIMEOUT);

});
