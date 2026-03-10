
fn make_ok(x: i32) -> Result<i32, i32> {
    Ok(x)
}

fn make_err(e: i32) -> Result<i32, i32> {
    Err(e)
}

#[test]
fn test_result_ok() {
    let r = make_ok(5);
    assert!(r.is_ok());
    assert_eq!(r.unwrap(), 5);
}

#[test]
fn test_result_err() {
    let r = make_err(99);
    assert!(r.is_err());
    assert_eq!(r.unwrap_err(), 99);
}

#[test]
fn test_result_pattern_match() {
    let r = make_ok(42);
    assert!(r.is_ok());
}
