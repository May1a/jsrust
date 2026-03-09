
fn as_opt<T>(t: T) -> Option<T> {
    Some(t)
}

#[test]
fn simple_opt() {
    assert_eq!(as_opt(5), Some(5));
}
