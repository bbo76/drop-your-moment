"""Authentification du portail opérateur exposé par le hotspot."""

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from dropyourmoment.api.kiosk_router import get_runtime
from dropyourmoment.runtime import Runtime

router = APIRouter(prefix="/admin/auth")
COOKIE_NAME = "dym_operator"


class CodeAttempt(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class AuthStatus(BaseModel):
    required: bool
    authenticated: bool


@router.get("/status", response_model=AuthStatus)
def auth_status(
    runtime: Runtime = Depends(get_runtime),
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> AuthStatus:
    return AuthStatus(
        required=runtime.operator_access.active,
        authenticated=runtime.operator_access.authorize(token),
    )


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
def login(
    attempt: CodeAttempt,
    request: Request,
    response: Response,
    runtime: Runtime = Depends(get_runtime),
) -> None:
    client = request.client.host if request.client else "unknown"
    try:
        token = runtime.operator_access.authenticate(attempt.code, client)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="code incorrect")
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="strict", path="/")
