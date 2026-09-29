import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication, transitionApplication, updateApplicationDocuments, summariseApplications } from '../applicationStore.js';

test('creates an application in saved state', () => {
  const app = createApplication({ job:{title:'Software Engineer'}, matchScore:82 });
  assert.equal(app.status, 'saved');
  assert.equal(app.matchScore, 82);
  assert.ok(app.id);
});

test('allows normal application progression', () => {
  let app = createApplication();
  app = transitionApplication(app, 'tailoring');
  app = transitionApplication(app, 'ready_to_apply');
  app = transitionApplication(app, 'applied');
  app = transitionApplication(app, 'interview');
  app = transitionApplication(app, 'offer');
  assert.equal(app.status, 'offer');
  assert.ok(app.appliedAt);
});

test('rejects invalid status transitions', () => {
  const app = createApplication();
  assert.throws(() => transitionApplication(app, 'offer'), /Invalid application transition/);
});

test('attaches generated documents without losing existing documents', () => {
  const app = createApplication({ documents:{cv:'cv-v1'} });
  const updated = updateApplicationDocuments(app, {coverLetter:'letter-v1'});
  assert.equal(updated.documents.cv, 'cv-v1');
  assert.equal(updated.documents.coverLetter, 'letter-v1');
});

test('summarises application statuses', () => {
  const apps = [createApplication({status:'saved'}), createApplication({status:'applied'}), createApplication({status:'applied'})];
  const summary = summariseApplications(apps);
  assert.equal(summary.total, 3);
  assert.equal(summary.byStatus.applied, 2);
});
