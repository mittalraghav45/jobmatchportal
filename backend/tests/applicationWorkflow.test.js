import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationStatuses, createApplication, transitionApplication, attachApplicationMaterials, applicationSummary } from '../applicationWorkflow.js';

test('creates a saved application', () => {
  const app = createApplication({ job:{id:'j1',title:'Software Engineer',company:'Example Ltd'}, match:{score:82}, now:'2026-09-29T12:00:00Z' });
  assert.equal(app.status, 'saved');
  assert.equal(app.match.score, 82);
  assert.equal(app.createdAt, '2026-09-29T12:00:00Z');
});

test('allows valid application progression', () => {
  let app = createApplication({job:{title:'Developer',company:'Example'}, now:'2026-09-29T12:00:00Z'});
  app = transitionApplication(app, 'tailoring', '2026-09-29T12:01:00Z');
  app = transitionApplication(app, 'ready_to_apply', '2026-09-29T12:02:00Z');
  app = transitionApplication(app, 'applied', '2026-09-29T12:03:00Z');
  assert.equal(app.status, 'applied');
  assert.equal(app.appliedAt, '2026-09-29T12:03:00Z');
});

test('rejects invalid transitions', () => {
  const app = createApplication({job:{title:'Developer',company:'Example'}});
  assert.throws(() => transitionApplication(app, 'offer'), /Invalid transition/);
});

test('attaches generated materials without changing status', () => {
  const app = createApplication({job:{title:'Developer',company:'Example'}});
  const updated = attachApplicationMaterials(app, {coverLetter:'Draft', cv:'Tailored CV'});
  assert.equal(updated.status, 'saved');
  assert.equal(updated.materials.coverLetter, 'Draft');
});

test('summarises application statuses', () => {
  const summary = applicationSummary([{status:'saved'},{status:'saved'},{status:'applied'},{status:'interview'}]);
  assert.equal(summary.saved, 2);
  assert.equal(summary.applied, 1);
  assert.equal(summary.interview, 1);
  assert.equal(applicationStatuses().length, 8);
});
