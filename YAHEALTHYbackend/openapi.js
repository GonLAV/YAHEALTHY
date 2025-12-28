const swaggerJSDoc = require('swagger-jsdoc');

function buildOpenApiSpec({ version }) {
  return swaggerJSDoc({
    definition: {
      openapi: '3.0.3',
      info: {
        title: 'YAHEALTHY API',
        version: version || '2.0'
      },
      servers: [{ url: 'http://localhost:5000' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      paths: {
        '/api/health': {
          get: {
            security: [],
            summary: 'Health check',
            responses: { '200': { description: 'OK' } }
          }
        },
        '/api/ready': {
          get: {
            security: [],
            summary: 'Readiness check (DB connectivity)',
            responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } }
          }
        },
        '/api/auth/signup': {
          post: {
            security: [],
            summary: 'Create account',
            requestBody: { required: true },
            responses: { '201': { description: 'Created' }, '400': { description: 'Invalid input' } }
          }
        },

      '/api/nutrition-score/range': {
        get: {
          tags: ['Food Logs'],
          summary: 'Get nutrition score per day for a date range',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'start',
              in: 'query',
              required: true,
              schema: { type: 'string', example: '2025-12-27' }
            },
            {
              name: 'end',
              in: 'query',
              required: true,
              schema: { type: 'string', example: '2025-12-28' }
            }
          ],
          responses: {
            200: {
              description: 'Nutrition scores for the range',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      start: { type: 'string' },
                      end: { type: 'string' },
                      daysCount: { type: 'number' },

        '/api/macro-balance/range': {
          get: {
            tags: ['Food Logs'],
            summary: 'Get macro balance per day for a date range',
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                name: 'start',
                in: 'query',
                required: true,
                schema: { type: 'string', example: '2025-12-27' }
              },
              {
                name: 'end',
                in: 'query',
                required: true,
                schema: { type: 'string', example: '2025-12-28' }
              }
            ],
            responses: {
              200: {
                description: 'Macro balance for the range',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        start: { type: 'string' },
                        end: { type: 'string' },
                        daysCount: { type: 'number' },
                        targets: { type: 'object' },
                        totals: { type: 'object' },
                        days: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              date: { type: 'string' },
                              count: { type: 'number' },
                              targets: { type: 'object' },
                              consumed: { type: 'object' },
                              remaining: { type: 'object' },
                              overBy: { type: 'object' }
                            }
                          }
                        },
                        hasTargets: { type: 'boolean' },
                        surveyId: { type: 'string', nullable: true }
                      }
                    }
                  }
                }
              },
              400: { $ref: '#/components/responses/BadRequest' },
              401: { $ref: '#/components/responses/Unauthorized' },
              500: { $ref: '#/components/responses/InternalServerError' }
            }
          }
        },
                      averageScore: { type: 'number', nullable: true },
                      targets: { type: 'object' },
                      totals: { type: 'object' },
                      days: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            date: { type: 'string' },
                            score: { type: 'number' },
                            consumed: { type: 'object' },
                            overBy: { type: 'object' },
                            count: { type: 'number' }
                          }
                        }
                      },
                      surveyId: { type: 'string', nullable: true },
                      hasTargets: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            500: { $ref: '#/components/responses/InternalServerError' }
          }
        }
      },
        '/api/auth/login': {
          post: {
            security: [],
            summary: 'Login',
            requestBody: { required: true },
            responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/auth/change-password': {
          post: {
            summary: 'Change password',
            requestBody: { required: true },
            responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/auth/request-password-reset': {
          post: {
            security: [],
            summary: 'Request password reset token',
            requestBody: { required: true },
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid input' } }
          }
        },
        '/api/auth/reset-password': {
          post: {
            security: [],
            summary: 'Reset password with token',
            requestBody: { required: true },
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid/expired token' } }
          }
        },
        '/api/auth/me': {
          get: {
            summary: 'Get current user',
            responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/users/me/preferences': {
          get: {
            summary: 'Get user preferences',
            responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
          },
          put: {
            summary: 'Update user preferences',
            requestBody: { required: true },
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/recipes': {
          get: {
            summary: 'List recipes',
            responses: { '200': { description: 'OK' } }
          }
        },
        '/api/recipes/shuffle': {
          get: {
            summary: 'Get random recipes',
            parameters: [
              {
                name: 'count',
                in: 'query',
                required: false,
                schema: { type: 'integer', minimum: 1, maximum: 50 }
              }
            ],
            responses: { '200': { description: 'OK' } }
          }
        },
        '/api/recipes/{id}': {
          get: {
            summary: 'Get recipe by id',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } }
          }
        },
        '/api/recipes/{id}/share': {
          get: {
            summary: 'Get share links for recipe',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } }
          }
        }
        ,
        '/api/grocery-list': {
          get: {
            summary: 'Build grocery list from meal plans',
            parameters: [
              { name: 'start', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
              { name: 'end', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/meal-plans/generate': {
          post: {
            summary: 'Generate meal plans for a date range',
            requestBody: { required: true },
            responses: { '201': { description: 'Created' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-logs': {
          get: {
            summary: 'List food logs',
            parameters: [
              { name: 'date', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
              { name: 'start', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
              { name: 'end', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
              { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200 }, description: 'Max items to return (required if offset is set)' },
              { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 }, description: 'Number of items to skip (requires limit)' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          },
          post: {
            summary: 'Create food log',
            description: 'Optional mealType must be one of: breakfast, lunch, dinner, snack.',
            requestBody: { required: true },
            responses: { '201': { description: 'Created' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-days': {
          get: {
            summary: 'List dates with food logs',
            parameters: [
              { name: 'start', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
              { name: 'end', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-logs/{id}': {
          get: {
            summary: 'Get food log by id',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' } }
          },
          put: {
            summary: 'Update food log by id',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            requestBody: { required: true },
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' } }
          },
          patch: {
            summary: 'Patch food log by id',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            requestBody: { required: true },
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' } }
          },
          delete: {
            summary: 'Delete food log by id',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' } }
          }
        },
        '/api/food-logs/bulk': {
          post: {
            summary: 'Create multiple food logs',
            description: 'Optional mealType must be one of: breakfast, lunch, dinner, snack.',
            requestBody: { required: true },
            responses: { '201': { description: 'Created' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-logs/import': {
          post: {
            summary: 'Import food logs',
            description: 'Imports food logs from a CSV-ish JSON payload; numeric fields may be strings. Optional mealType must be one of: breakfast, lunch, dinner, snack.',
            requestBody: { required: true },
            responses: { '201': { description: 'Created' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-logs/copy': {
          post: {
            summary: 'Copy food logs from one day to another',
            requestBody: { required: true },
            responses: { '201': { description: 'Created' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-logs/template': {
          post: {
            summary: 'Create a reusable food log template',
            description: 'Saves a reusable meal template. Optional mealType must be one of: breakfast, lunch, dinner, snack.',
            requestBody: { required: true },
            responses: { '201': { description: 'Created' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-logs/templates': {
          get: {
            summary: 'List reusable food log templates',
            parameters: [
              { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200 }, description: 'Max items to return (required if offset is set)' },
              { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 }, description: 'Number of items to skip (requires limit)' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-logs/templates/{id}': {
          delete: {
            summary: 'Delete a reusable food log template',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid input' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' } }
          }
        },
        '/api/food-summary': {
          get: {
            summary: 'Daily food totals',
            parameters: [
              { name: 'date', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-summary/range': {
          get: {
            summary: 'Food totals per day for a date range',
            parameters: [
              { name: 'start', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
              { name: 'end', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-summary/week': {
          get: {
            summary: 'Food totals per day for a week window',
            parameters: [
              { name: 'weekStart', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/food-summary/month': {
          get: {
            summary: 'Food totals per day for a month window',
            parameters: [
              { name: 'month', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        },
        '/api/calorie-balance': {
          get: {
            summary: 'Daily calorie target vs consumed',
            parameters: [
              { name: 'date', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        }
        ,
        '/api/macro-balance': {
          get: {
            summary: 'Daily macro targets vs consumed',
            parameters: [
              { name: 'date', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        }
        ,
        '/api/nutrition-score': {
          get: {
            summary: 'Daily nutrition score (0-100) based on targets',
            parameters: [
              { name: 'date', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        }
        ,
        '/api/weekly-calorie-balance': {
          get: {
            summary: 'Aggregate calorie target vs consumed for a date range',
            parameters: [
              { name: 'start', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
              { name: 'end', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        }
        ,
        '/api/weekly-nutrition': {
          get: {
            summary: 'Aggregate nutrition scores and totals for a date range',
            parameters: [
              { name: 'start', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' },
              { name: 'end', in: 'query', required: true, schema: { type: 'string' }, description: 'YYYY-MM-DD' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        }
        ,
        '/api/streaks': {
          get: {
            summary: 'Compute streaks based on days with food logs',
            parameters: [
              { name: 'asOf', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYY-MM-DD (defaults to today UTC)' }
            ],
            responses: { '200': { description: 'OK' }, '400': { description: 'Invalid query' }, '401': { description: 'Unauthorized' } }
          }
        }
      }
    },
    apis: []
  });
}

module.exports = {
  buildOpenApiSpec
};
