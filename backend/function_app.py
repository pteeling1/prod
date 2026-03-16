"""
Azure Functions wrapper for the backend API.

This allows the Express app to run on Azure Functions.
Deploy this to Azure Functions, and set environment variables in the Function App settings.
"""

import azure.functions as func
from server import app

async_app = func.AsgiRequest(app)

@app.route('api/{*route}', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
async def main(req: func.HttpRequest) -> func.HttpResponse:
    """
    Main Azure Functions entry point.
    All /api/* routes are handled by the Express app.
    """
    return await async_app.handle_async(req)
