
fn make_ok(x: i32) -> Result<i32, &'static str> {
    Ok(x)
}

fn make_err() -> Result<i32, &'static str> {
    Err("error")
}

#[test]
fn test_result_ok() {
    let r = make_ok(5);
    assert!(r.is_ok());
    assert_eq!(r.unwrap(), 5);
}

#[test]
fn test_result_err() {
    let r = make_err();
    assert!(r.is_err());
    assert_eq!(r.unwrap_err(), "error");
}

#[test]
fn test_result_pattern_match() {
    let r = make_ok(42);
    match r {
        Ok(value) => assert_eq!(value, 42),
        Err(_) => assert!(false),
    }
}
