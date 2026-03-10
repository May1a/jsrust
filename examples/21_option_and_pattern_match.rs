
fn as_opt<T>(t: T) -> Option<T> {
    Some(t)
}

#[test]
fn simple_opt() {
    assert_eq!(as_opt(5), Some(5));
}

#[test]
fn test_option_methods() {
    let s: Option<i32> = Some(42);
    let n: Option<i32> = None;
    assert!(s.is_some());
    assert!(n.is_none());
    assert_eq!(s.expect("expected value"), 42);
    assert_eq!(s.unwrap(), 42);
}
