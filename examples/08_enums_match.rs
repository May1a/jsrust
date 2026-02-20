enum Color {
    Red,
    Green,
    Blue,
}

#[test]
fn test_example() {
    let c = Color::Red;
    let v = match 1 {
        1 => 10,
        2 => 20,
        _ => 0,
    };
}
