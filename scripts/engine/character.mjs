function point(x, y, length, angle) { return { x: x + Math.sin(angle) * length, y: y + Math.cos(angle) * length }; }
function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

export function drawCharacter(ctx, d, pose) {
  const { x, y } = pose.root;
  const ink = d.colors?.line ?? '#171717';
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = d.strokeWidth; ctx.strokeStyle = ink;
  const neck = { x, y: y - d.torsoLength * 0.76 };
  const hip = point(x, y, d.torsoLength, pose.torso);
  const head = point(neck.x, neck.y, d.headRadius * 1.12, pose.head + Math.PI);
  ctx.beginPath(); ctx.arc(head.x, head.y, d.headRadius, 0, Math.PI * 2); ctx.fillStyle = d.colors?.skin ?? '#fff'; ctx.fill(); ctx.stroke();
  const eyeY = head.y - d.headRadius * 0.12, eyeDx = d.headRadius * 0.35;
  ctx.fillStyle = ink; for (const ex of [head.x - eyeDx, head.x + eyeDx]) { ctx.beginPath(); ctx.arc(ex, eyeY, Math.max(2, d.headRadius * 0.055), 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, d.strokeWidth * 0.48);
  const brow = pose.expression?.brows === 'concerned' ? -0.2 : pose.expression?.brows === 'angry' ? 0.2 : 0;
  for (const sign of [-1,1]) { ctx.beginPath(); ctx.moveTo(head.x + sign * eyeDx - 4, eyeY - d.headRadius * 0.2 + brow * sign); ctx.lineTo(head.x + sign * eyeDx + 4, eyeY - d.headRadius * 0.2 - brow * sign); ctx.stroke(); }
  ctx.beginPath();
  if (pose.expression?.mouth === 'open') ctx.ellipse(head.x, head.y + d.headRadius * 0.4, d.headRadius * 0.13, d.headRadius * 0.19, 0, 0, Math.PI * 2);
  else if (pose.expression?.mouth === 'frown') { ctx.moveTo(head.x - 5, head.y + d.headRadius * 0.48); ctx.quadraticCurveTo(head.x, head.y + d.headRadius * 0.34, head.x + 5, head.y + d.headRadius * 0.48); }
  else { ctx.moveTo(head.x - 5, head.y + d.headRadius * 0.4); ctx.quadraticCurveTo(head.x, head.y + d.headRadius * 0.54, head.x + 5, head.y + d.headRadius * 0.4); }
  ctx.fillStyle = ink; if (pose.expression?.mouth === 'open') ctx.fill(); else ctx.stroke();
  ctx.lineWidth = d.strokeWidth; ctx.strokeStyle = ink;
  line(ctx, neck, hip);
  for (const [side, sign] of [['L',-1],['R',1]]) {
    const shoulder = { x: x + sign * d.torsoLength * 0.18, y: y - d.torsoLength * 0.65 };
    const elbow = point(shoulder.x, shoulder.y, d.upperArmLength, pose[`shoulder${side}`] * sign);
    const wrist = point(elbow.x, elbow.y, d.lowerArmLength, (pose[`shoulder${side}`] + pose[`elbow${side}`]) * sign);
    line(ctx, shoulder, elbow); line(ctx, elbow, wrist);
    ctx.beginPath(); ctx.arc(wrist.x, wrist.y, d.strokeWidth * 0.7, 0, Math.PI*2); ctx.fillStyle = ink; ctx.fill();
    const knee = point(hip.x, hip.y, d.upperLegLength, pose[`hip${side}`] * sign);
    const ankle = point(knee.x, knee.y, d.lowerLegLength, (pose[`hip${side}`] + pose[`knee${side}`]) * sign);
    line(ctx, hip, knee); line(ctx, knee, ankle);
    line(ctx, ankle, { x: ankle.x + sign * d.lowerLegLength * 0.18, y: ankle.y + 2 });
  }
  ctx.restore();
}
