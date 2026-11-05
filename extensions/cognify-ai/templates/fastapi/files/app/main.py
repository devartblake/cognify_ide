from fastapi import FastAPI

app = FastAPI(title="{{projectName}}")


@app.get("/")
def read_root() -> dict[str, str]:
	return {"message": "Hello from {{projectName}}"}


@app.get("/health")
def health() -> dict[str, str]:
	return {"status": "ok"}
