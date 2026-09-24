function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  if (res.headersSent) return next(err);
  const status = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
}

function notFound(req, res) {
  res.status(404).json({ error: 'Resource not found' });
}

module.exports = { errorHandler, notFound };
