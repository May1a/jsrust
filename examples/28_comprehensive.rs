
pub struct Test {
   pub a: i32,
   pub arr: Vec<i32>,
}

impl Test {
    pub fn new() {
        let test = Test {
            a: 5,
            arr: vec![0],
        };
        test
    }
}

#[test]
fn do_testing() {
    let test = Test::new();
    println!("{}", test.a);
    test.arr.push(5);
}