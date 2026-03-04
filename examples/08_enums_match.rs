enum Color {
    Red,
    Green,
    Blue,
}

#[test]
fn test_example() {
    let c = Color::Green;
    let v = match c {
        Color::Red => "Color Red!",
        Color::Green => "Color Green!",
        Color::Blue => "Color Blue!",
    };
    println!("{}", v);
}
