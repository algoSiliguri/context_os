from context_os_runtime import __version__


def test_runtime_package_exposes_version() -> None:
    assert __version__ == "0.1.0"
